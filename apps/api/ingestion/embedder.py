import math
import os
import time
from typing import List, Sequence

from google import genai
from google.genai import types, errors

from graph.config import EMBEDDING_MODEL, EMBEDDING_DIM

# Batch configuration
# Uses 20-25 texts per embed request to stay within optimal request sizing
BATCH_SIZE = 25

# Inter-batch pause tuned to stay under free-tier token limits (assuming ~30,000 tokens/min).
# Tune this value as needed based on workload and token budget.
BATCH_DELAY_SECONDS = 1.0

# Retry configuration
MAX_RETRIES = 5
BASE_RETRY_DELAY_SECONDS = 2.0


def _get_client() -> genai.Client:
    api_key = os.getenv("GOOGLE_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError(
            "GOOGLE_API_KEY environment variable is missing or empty. "
            "Please set GOOGLE_API_KEY to use Gemini embeddings."
        )
    return genai.Client(api_key=api_key)


def _normalize_vector(vector: List[float]) -> List[float]:
    norm = math.sqrt(sum(v * v for v in vector))
    if norm == 0.0:
        raise ValueError("Received zero-length vector from Gemini embedding model")
    return [v / norm for v in vector]


def _embed_batch(
    client: genai.Client,
    texts: List[str],
    task_type: str,
) -> List[List[float]]:
    config = types.EmbedContentConfig(
        task_type=task_type,
        output_dimensionality=EMBEDDING_DIM,
    )

    last_error = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = client.models.embed_content(
                model=EMBEDDING_MODEL,
                contents=texts,
                config=config,
            )

            if not response.embeddings:
                raise RuntimeError("Gemini returned empty embeddings list")

            if len(response.embeddings) != len(texts):
                raise RuntimeError(
                    f"Gemini returned {len(response.embeddings)} embeddings, expected {len(texts)}"
                )

            vectors: List[List[float]] = []
            for idx, item in enumerate(response.embeddings):
                values = item.values
                if values is None or len(values) != EMBEDDING_DIM:
                    actual_len = len(values) if values is not None else 0
                    raise ValueError(
                        f"Embedding dimension mismatch at index {idx}: "
                        f"expected {EMBEDDING_DIM}, got {actual_len}"
                    )
                vectors.append(_normalize_vector([float(v) for v in values]))

            return vectors

        except (errors.ServerError, errors.APIError) as exc:
            status_code = getattr(exc, "code", None)

            # Do not retry 400 (Bad Request) or 403 (Forbidden)
            if status_code in (400, 403):
                raise

            is_retryable = (
                isinstance(exc, errors.ServerError)
                or status_code == 429
                or (isinstance(status_code, int) and status_code >= 500)
            )
            if not is_retryable:
                raise

            last_error = exc
            if attempt == MAX_RETRIES:
                break

            # Honor Retry-After header if present
            retry_after = None
            if hasattr(exc, "response") and exc.response is not None:
                headers = getattr(exc.response, "headers", {})
                val = headers.get("retry-after") or headers.get("Retry-After")
                if val:
                    try:
                        retry_after = float(val)
                    except (ValueError, TypeError):
                        retry_after = None

            if retry_after is not None and retry_after > 0:
                sleep_seconds = retry_after
            else:
                sleep_seconds = min(BASE_RETRY_DELAY_SECONDS * (2 ** (attempt - 1)), 60.0)

            time.sleep(sleep_seconds)

    raise RuntimeError(
        f"Gemini embedding failed after {MAX_RETRIES} attempts. Last error: {last_error}"
    )


def embed_texts(
    texts: str | Sequence[str],
    task_type: str | None = None,
) -> List[float] | List[List[float]]:
    """
    Embed one text or many texts using Google's gemini-embedding-001 via the google-genai SDK.

    - If texts is a single str (e.g., a query), returns a single normalized 768-dim vector (List[float]).
      Defaults to task_type="RETRIEVAL_QUERY".
    - If texts is a sequence of str (e.g., document chunks), returns a list of normalized 768-dim vectors (List[List[float]]).
      Defaults to task_type="RETRIEVAL_DOCUMENT".
    """
    single_input = isinstance(texts, str)
    text_list = [texts] if single_input else list(texts)

    if not text_list:
        raise ValueError("embed_texts requires at least one text")

    if task_type is None:
        task_type = "RETRIEVAL_QUERY" if single_input else "RETRIEVAL_DOCUMENT"

    client = _get_client()
    embeddings: List[List[float]] = []

    for i, start in enumerate(range(0, len(text_list), BATCH_SIZE)):
        if i > 0 and BATCH_DELAY_SECONDS > 0:
            time.sleep(BATCH_DELAY_SECONDS)
        batch = text_list[start : start + BATCH_SIZE]
        embeddings.extend(_embed_batch(client, batch, task_type=task_type))

    return embeddings[0] if single_input else embeddings
