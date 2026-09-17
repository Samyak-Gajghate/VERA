# ============================================================
# GRAPH CONFIGURATION
# All magic numbers live here. Change these to tune the system.
# Each will become a variable in the paper's ablation study.
# ============================================================

import os

# Retrieval
TOP_K_RETRIEVE = 10        # chunks retrieved from pgvector before reranking
TOP_K_RERANK = 4           # chunks kept after Cohere reranking

# Self-correction loop budgets
MAX_RETRIES = 2            # max query rewrites before giving up on retrieval
MAX_REGENERATIONS = 2      # max answer regenerations if hallucination detected
MIN_RELEVANT_DOCS = 1      # minimum relevant docs needed to attempt generation

# Confidence thresholds
LOW_CONFIDENCE_THRESHOLD = 0.4  # below this, we note the answer is uncertain

# Embedding model — must match Vector(768) in the schema
EMBEDDING_MODEL = "multi-qa-mpnet-base-dot-v1"
EMBEDDING_DIM = 768

# Required env vars for runtime-critical external services
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
REQUIRED_ENV_VARS = ["HF_API_TOKEN"]

if ENVIRONMENT.lower() == "production":
    missing_required_env_vars = [
        env_var for env_var in REQUIRED_ENV_VARS if not os.getenv(env_var)
    ]
    if missing_required_env_vars:
        raise RuntimeError(
            f"{', '.join(missing_required_env_vars)} is required in production"
        )

# LLM models
FAST_LLM_MODEL = "gemini-2.5-flash"
GENERATE_LLM_MODEL = "gemini-2.5-flash"  # for answer generation (same model, but streaming=True)

# Web Search Fallbacks
TOP_K_WEB_SEARCH = 4
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "")
