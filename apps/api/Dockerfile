# ── Stage 1: builder — install Python deps into a clean layer ──────────────
FROM python:3.12-slim AS builder

WORKDIR /build

# Install build deps needed by some packages (psycopg2-binary, sentence-transformers)
RUN apt-get update && apt-get install -y --no-install-recommends \
        gcc \
        libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt


# ── Stage 2: runtime image ──────────────────────────────────────────────────
FROM python:3.12-slim

WORKDIR /app

# Runtime-only system library needed by psycopg2-binary
RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Copy installed packages from builder
COPY --from=builder /install /usr/local

# Copy application source
COPY . .

# The container reads PORT at runtime, with 7860 as the default for
# Hugging Face Spaces while still allowing explicit overrides.
EXPOSE 7860

# Run as non-root for security best practice
RUN adduser --disabled-password --gecos "" appuser
USER appuser

# CMD uses sh -c so the shell can expand $PORT at runtime.
# Defaults to 7860 if PORT is not set, while honoring any explicit override.
CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-7860}"]
