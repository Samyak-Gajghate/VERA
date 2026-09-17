import math
import os
import time
from typing import List, Sequence

import httpx

from graph.config import EMBEDDING_MODEL


HF_EMBEDDING_URL = (
    f"https://router.huggingface.co/hf-inference/models/sentence-transformers/{EMBEDDING_MODEL}/pipeline/feature-extraction"
)
HF_BATCH_SIZE = 32
HF_MAX_RETRIES = 5
HF_REQUEST_TIMEOUT_SECONDS = 120.0


def _get_hf_token() -> str:
    token = os.getenv("HF_API_TOKEN", "").strip()
    if not token:
        raise RuntimeError("HF_API_TOKEN is required for Hugging Face embeddings")
    return token


def _normalize_embedding(embedding: List[float]) -> List[float]:
    norm = math.sqrt(sum(value * value for value in embedding))
    if norm == 0:
        raise RuntimeError("Hugging Face returned a zero embedding vector")
    return [value / norm for value in embedding]


def _coerce_embeddings(payload) -> List[List[float]]:
    if isinstance(payload, list):
        if not payload:
            raise RuntimeError("Hugging Face returned an empty embedding payload")
        if isinstance(payload[0], list):
            return payload
        if all(isinstance(value, (int, float)) for value in payload):
            return [payload]

    raise RuntimeError(
        f"Unexpected Hugging Face embedding response shape: {type(payload).__name__}"
    )


def _embed_batch(texts: List[str]) -> List[List[float]]:
    headers = {
        "Authorization": f"Bearer {_get_hf_token()}",
        "Content-Type": "application/json",
    }
    request_inputs = texts[0] if len(texts) == 1 else texts

    last_error = None
    for attempt in range(1, HF_MAX_RETRIES + 1):
        try:
            response = httpx.post(
                HF_EMBEDDING_URL,
                headers=headers,
                json={
                    "inputs": request_inputs,
                    "options": {"wait_for_model": True},
                },
                timeout=HF_REQUEST_TIMEOUT_SECONDS,
            )
        except httpx.RequestError as exc:
            last_error = str(exc)
            if attempt == HF_MAX_RETRIES:
                break
            time.sleep(min(2.0 ** attempt, 30.0))
            continue

        if response.status_code == 503:
            try:
                payload = response.json()
            except ValueError:
                payload = {}

            estimated_time = payload.get("estimated_time")
            try:
                wait_seconds = float(estimated_time) if estimated_time is not None else 2.0 ** attempt
            except (TypeError, ValueError):
                wait_seconds = 2.0 ** attempt

            wait_seconds = min(max(wait_seconds, 1.0), 30.0)
            last_error = payload.get("error") or response.text or "Model is starting"

            if attempt == HF_MAX_RETRIES:
                break

            time.sleep(wait_seconds)
            continue

        if response.status_code >= 400:
            raise RuntimeError(
                "Hugging Face embedding request failed "
                f"with status {response.status_code}: {response.text}"
            )

        try:
            payload = response.json()
        except ValueError as exc:
            raise RuntimeError(
                f"Hugging Face embedding response was not valid JSON: {response.text[:200]}"
            ) from exc

        embeddings = _coerce_embeddings(payload)
        if len(texts) != len(embeddings):
            raise RuntimeError(
                "Hugging Face returned an unexpected number of embeddings "
                f"(expected {len(texts)}, got {len(embeddings)})"
            )

        return [_normalize_embedding([float(value) for value in embedding]) for embedding in embeddings]

    raise RuntimeError(
        "Hugging Face embedding model did not become available after "
        f"{HF_MAX_RETRIES} attempts: {last_error}"
    )


def embed_texts(texts: str | Sequence[str]) -> List[float] | List[List[float]]:
    """
    Embed one text or many texts using Hugging Face's hosted feature-extraction API.

    Returns a normalized 768-dimensional vector for a single input string, or a
    list of normalized vectors for a sequence of strings.
    """
    single_input = isinstance(texts, str)
    text_list = [texts] if single_input else list(texts)

    if not text_list:
        raise ValueError("embed_texts requires at least one text")

    embeddings: List[List[float]] = []
    for start in range(0, len(text_list), HF_BATCH_SIZE):
        batch = text_list[start:start + HF_BATCH_SIZE]
        embeddings.extend(_embed_batch(batch))

    return embeddings[0] if single_input else embeddings
