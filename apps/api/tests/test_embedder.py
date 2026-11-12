import math
import os
from unittest.mock import MagicMock, patch

import pytest
import httpx
from google.genai import errors, types

from ingestion.embedder import (
    embed_texts,
    _normalize_vector,
    _embed_batch,
    EMBEDDING_DIM,
    EMBEDDING_MODEL,
    BATCH_SIZE,
)


def _make_content_embedding(values):
    item = MagicMock()
    item.values = values
    return item


def _make_embed_response(values_list):
    resp = MagicMock()
    resp.embeddings = [_make_content_embedding(vals) for vals in values_list]
    return resp


def test_normalize_vector():
    vec = [3.0, 4.0] + [0.0] * (EMBEDDING_DIM - 2)
    normed = _normalize_vector(vec)
    assert len(normed) == EMBEDDING_DIM
    norm = math.sqrt(sum(v * v for v in normed))
    assert pytest.approx(norm) == 1.0
    assert pytest.approx(normed[0]) == 0.6
    assert pytest.approx(normed[1]) == 0.8


def test_normalize_zero_vector_raises():
    zero_vec = [0.0] * EMBEDDING_DIM
    with pytest.raises(ValueError, match="zero-length vector"):
        _normalize_vector(zero_vec)


def test_missing_google_api_key_raises():
    with patch.dict(os.environ, {}, clear=True):
        with pytest.raises(RuntimeError, match="GOOGLE_API_KEY environment variable is missing"):
            embed_texts("test question")


@patch("ingestion.embedder.genai.Client")
def test_embed_single_query_uses_retrieval_query(MockClient):
    mock_client_instance = MagicMock()
    MockClient.return_value = mock_client_instance

    raw_vec = [0.1] * EMBEDDING_DIM
    mock_client_instance.models.embed_content.return_value = _make_embed_response([raw_vec])

    with patch.dict(os.environ, {"GOOGLE_API_KEY": "fake-key"}):
        res = embed_texts("What is a transformer model?")

    assert isinstance(res, list)
    assert len(res) == EMBEDDING_DIM
    assert all(isinstance(v, float) for v in res)
    # Check normalized
    norm = math.sqrt(sum(v * v for v in res))
    assert pytest.approx(norm) == 1.0

    mock_client_instance.models.embed_content.assert_called_once()
    _, kwargs = mock_client_instance.models.embed_content.call_args
    assert kwargs["model"] == EMBEDDING_MODEL
    assert kwargs["contents"] == ["What is a transformer model?"]
    assert kwargs["config"].task_type == "RETRIEVAL_QUERY"
    assert kwargs["config"].output_dimensionality == EMBEDDING_DIM


@patch("ingestion.embedder.time.sleep")
@patch("ingestion.embedder.genai.Client")
def test_embed_batch_documents_uses_retrieval_document_and_batches(MockClient, mock_sleep):
    mock_client_instance = MagicMock()
    MockClient.return_value = mock_client_instance

    # 55 documents -> with BATCH_SIZE=25: 3 batches (25, 25, 5)
    texts = [f"Chunk number {i}" for i in range(55)]

    def side_effect(*args, **kwargs):
        batch = kwargs["contents"]
        return _make_embed_response([[0.05] * EMBEDDING_DIM for _ in batch])

    mock_client_instance.models.embed_content.side_effect = side_effect

    with patch.dict(os.environ, {"GOOGLE_API_KEY": "fake-key"}):
        res = embed_texts(texts)

    assert isinstance(res, list)
    assert len(res) == 55
    assert mock_client_instance.models.embed_content.call_count == 3

    # Check config for first batch call
    first_call_kwargs = mock_client_instance.models.embed_content.call_args_list[0][1]
    assert first_call_kwargs["config"].task_type == "RETRIEVAL_DOCUMENT"
    assert first_call_kwargs["config"].output_dimensionality == EMBEDDING_DIM
    assert len(first_call_kwargs["contents"]) == 25


@patch("ingestion.embedder.genai.Client")
def test_dimension_mismatch_fails_loudly(MockClient):
    mock_client_instance = MagicMock()
    MockClient.return_value = mock_client_instance

    # Model returns 256 dimensions instead of 768
    wrong_dim_vec = [0.1] * 256
    mock_client_instance.models.embed_content.return_value = _make_embed_response([wrong_dim_vec])

    with patch.dict(os.environ, {"GOOGLE_API_KEY": "fake-key"}):
        with pytest.raises(ValueError, match="Embedding dimension mismatch"):
            embed_texts("test question")


@patch("ingestion.embedder.time.sleep")
@patch("ingestion.embedder.genai.Client")
def test_retry_on_429_with_retry_after_header(MockClient, mock_sleep):
    mock_client_instance = MagicMock()
    MockClient.return_value = mock_client_instance

    raw_vec = [0.1] * EMBEDDING_DIM
    good_resp = _make_embed_response([raw_vec])

    http_resp = httpx.Response(429, headers={"Retry-After": "3.5"})
    rate_limit_err = errors.APIError(429, None, http_resp)

    mock_client_instance.models.embed_content.side_effect = [
        rate_limit_err,
        good_resp,
    ]

    with patch.dict(os.environ, {"GOOGLE_API_KEY": "fake-key"}):
        res = embed_texts("test question")

    assert len(res) == EMBEDDING_DIM
    assert mock_client_instance.models.embed_content.call_count == 2
    mock_sleep.assert_called_with(3.5)


@patch("ingestion.embedder.genai.Client")
def test_no_retry_on_400_or_403(MockClient):
    mock_client_instance = MagicMock()
    MockClient.return_value = mock_client_instance

    http_resp_400 = httpx.Response(400)
    bad_request_err = errors.APIError(400, None, http_resp_400)
    mock_client_instance.models.embed_content.side_effect = bad_request_err

    with patch.dict(os.environ, {"GOOGLE_API_KEY": "fake-key"}):
        with pytest.raises(errors.APIError):
            embed_texts("test question")

    assert mock_client_instance.models.embed_content.call_count == 1

    # Now test 403
    http_resp_403 = httpx.Response(403)
    forbidden_err = errors.APIError(403, None, http_resp_403)
    mock_client_instance.models.embed_content.side_effect = forbidden_err

    with patch.dict(os.environ, {"GOOGLE_API_KEY": "fake-key"}):
        with pytest.raises(errors.APIError):
            embed_texts("test question")

    assert mock_client_instance.models.embed_content.call_count == 2


@patch("ingestion.embedder.time.sleep")
@patch("ingestion.embedder.genai.Client")
def test_exhausted_retries_raises_runtime_error(MockClient, mock_sleep):
    mock_client_instance = MagicMock()
    MockClient.return_value = mock_client_instance

    http_resp_503 = httpx.Response(503)
    server_err = errors.APIError(503, None, http_resp_503)
    mock_client_instance.models.embed_content.side_effect = server_err

    with patch.dict(os.environ, {"GOOGLE_API_KEY": "fake-key"}):
        with pytest.raises(RuntimeError, match="Gemini embedding failed after 5 attempts"):
            embed_texts("test question")

    assert mock_client_instance.models.embed_content.call_count == 5
