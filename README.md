# VERA — Verified & Evaluated Retrieval Architecture

> **Self-Correcting, Hallucination-Resistant RAG Engine with Real-Time Auditability**

VERA (**V**erified & **E**valuated **R**etrieval **A**rchitecture) is an enterprise-grade, self-correcting RAG system implementing **CRAG (Corrective RAG)** and **Self-RAG** patterns. Built on a LangGraph state machine, VERA dynamically grades retrieved document relevance, rewrites unhelpful user queries, enforces strict inline source grounding, audits generated answers for factual hallucinations, and streams the entire reasoning trace to a real-time audit interface.

---

## 🌟 Key Features

* **Two-Stage Hybrid Retrieval**: Combines high-speed vector cosine similarity search in `pgvector` with cross-encoder reranking via Cohere (`rerank-english-v3.0`).
* **Chain-of-Thought Document Grading**: Evaluates retrieved chunks individually using Gemini 2.5 Flash to filter out noise before context injection.
* **Adaptive Query Rewriting**: Automatically reformulates conversational prompts into domain-optimized search queries when initial retrieval yields low-relevance results (up to 2 retry loops).
* **Dual-LLM Hallucination Auditing**: Uses an independent auditor LLM pass to inspect generated claims against raw source text, triggering negative-constraint regenerations if unsupported facts are detected.
* **Real-Time Audit Trail (SSE)**: Streams step-by-step state transitions (`retrieve` → `grade` → `rewrite` → `generate` → `hallucination_check`) via Server-Sent Events for complete operational transparency.
* **Analytics Dashboard**: Aggregates query volume, confidence distributions, hallucination frequency, and top retrieved documents over a 30-day window.

---

## 🏗️ System Architecture

```
VERA Monorepo Structure
├── apps/
│   ├── api/                    # FastAPI Backend (Python 3.12+)
│   │   ├── graph/              # LangGraph state machine, nodes, prompts, config
│   │   ├── ingestion/          # PDF/TXT/MD parsers, chunker, embedder, retriever
│   │   ├── database/           # SQLAlchemy models, connection pool, Alembic migrations
│   │   ├── scripts/            # CLI document ingestion tool
│   │   └── tests/              # Pytest test suite with LLM & DB mocks
│   └── web/                    # Next.js 16 Frontend
│       ├── app/                # Chat interface & analytics dashboard
│       └── components/         # Real-time audit trail, chat components
└── packages/
    └── types/                  # Shared TypeScript interfaces & SSE protocol types
```

---

## 🔄 Core Pipeline & Working Mechanism

```mermaid
flowchart TD
    A[User Question] --> B[1. Retrieve Chunks]
    B --> C[pgvector Cosine Search - Top 10]
    C --> D[Cohere Reranker - Top 4]
    D --> E[2. Grade Document Relevance]
    
    E --> F{Relevant Docs Found?}
    F -->|No & Retries < 2| G[3. Rewrite Query]
    G -->|New Query| B
    
    F -->|Yes OR Retries Exceeded| H[4. Generate Answer with Citations]
    
    H --> I[5. Audit Answer for Hallucinations]
    I --> J{Hallucination Detected?}
    
    J -->|Yes & Regens < 2| H
    J -->|No OR Regens Exceeded| K[6. Stream Final Response + Log Audit]
```

### Step-by-Step Execution

1. **Document Ingestion & Indexing**:
   * Text extracted from `.pdf`, `.txt`, and `.md` files.
   * Words split via a 400-word sliding window with 50-word overlap (min. 30 words).
   * Dense 768-dimensional embeddings generated using `multi-qa-mpnet-base-dot-v1` (`sentence-transformers`).
   * Vectors stored in PostgreSQL with an HNSW cosine similarity index (`vector_cosine_ops`).

2. **Stage 1 & 2 Retrieval (`retrieve`)**:
   * Initial vector search fetches the top 10 nearest chunk vectors.
   * Cohere Cross-Encoder reranks the 10 candidates down to the top 4 most contextually relevant chunks.

3. **Relevance Assessment (`grade_documents`)**:
   * Gemini 2.5 Flash evaluates each chunk individually to determine if it directly supports or answers the query.
   * Irrelevant chunks are pruned from context.

4. **Self-Correction Loop (`rewrite_query`)**:
   * If zero relevant chunks are found, VERA rewrites the question into formal technical keywords and retries retrieval (max 2 attempts).

5. **Grounded Generation (`generate`)**:
   * Constructs the final prompt using **only** verified relevant chunks.
   * Instructs the model to cite sources inline (`[Source: filename]`).

6. **Fact-Checking & Auditing (`hallucination_check`)**:
   * An independent LLM auditor verifies that every claim in the answer is grounded in the retrieved chunks.
   * If hallucinations are detected, regeneration is triggered with strict negative constraint instructions.

---

## 🛠️ Prerequisites

* **Python**: 3.12+
* **Node.js**: 20+
* **PostgreSQL**: 16+ with the `pgvector` extension enabled
* **Google AI API Key**: Gemini 2.5 Flash ([Get key](https://aistudio.google.com/))
* **Cohere API Key**: Cohere Reranker ([Get key](https://cohere.com/))

---

## 🚀 Quick Start & Setup

### 1. Start Database Container
```bash
docker compose up -d postgres
```
*Runs PostgreSQL 16 + pgvector on port **5433** to avoid port collisions with existing local Postgres instances.*

### 2. Configure Environment Variables
Copy `.env.example` to `.env` in `apps/api`:
```bash
cd apps/api
cp ../../.env.example .env
```
Fill in your configuration details:
```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/vera
GOOGLE_API_KEY=your_google_ai_key_here
COHERE_API_KEY=your_cohere_key_here
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### 3. Install Backend Dependencies & Run Migrations
```bash
cd apps/api
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Run Alembic database migrations
alembic upgrade head
```

### 4. Ingest Sample Documents
Ingest sample research papers included in the repository or your custom documents:
```bash
# Ingest included sample papers
python scripts/ingest_docs.py --dir ../../sample_docs

# Or ingest your own files
python scripts/ingest_docs.py --file /path/to/paper.pdf
```

### 5. Start the FastAPI Server
```bash
uvicorn main:app --reload --port 8000
```
Verify health status: `curl http://localhost:8000/health`

### 6. Install & Start Frontend (Next.js)
```bash
# From workspace root
npm install
npm run dev:web
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## ⚙️ Configuration Parameters (`apps/api/graph/config.py`)

| Parameter | Default | Description |
|---|---|---|
| `TOP_K_RETRIEVE` | `10` | Initial candidate chunks retrieved from `pgvector` |
| `TOP_K_RERANK` | `4` | Chunks retained after Cohere cross-encoder reranking |
| `MAX_RETRIES` | `2` | Maximum query rewrite retries when retrieval returns no relevant docs |
| `MAX_REGENERATIONS` | `2` | Maximum answer regenerations if hallucinations are flagged |
| `MIN_RELEVANT_DOCS` | `1` | Minimum relevant documents required to attempt answer generation |
| `EMBEDDING_MODEL` | `multi-qa-mpnet-base-dot-v1` | 768-dim SentenceTransformer model |

---

## 📡 API Endpoints & SSE Protocol

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | API health check |
| `POST` | `/ask` | Main SSE streaming RAG query pipeline |
| `POST` | `/upload` | Upload & ingest document (`.pdf`, `.txt`, `.md`) |
| `GET` | `/analytics` | Aggregated dashboard telemetry |
| `GET` | `/sessions/{id}/queries` | Query execution history for a session |
| `GET` | `/queries/{id}/audit` | Detailed audit trail for a specific query |

### SSE Event Specification (`POST /ask`)
```http
data: {"type": "start", "message": "Processing...", "session_id": "...", "query_id": "..."}
data: {"type": "retrieve", "message": "Retrieved 4 documents", "data": {...}}
data: {"type": "grade", "message": "2 of 4 documents graded relevant", "data": {...}}
data: {"type": "rewrite", "message": "Query rewritten (attempt 1)", "data": {...}}
data: {"type": "generate", "message": "Answer generated", "data": {...}}
data: {"type": "hallucination_check", "message": "Answer is grounded in sources", "data": {...}}
data: {"type": "final", "message": "Complete", "data": {"answer": "...", "confidence": 0.95, "sources": [...]}}
```

---

## 🧪 Testing

Run unit & graph integration tests (all external LLMs and DB sessions are mocked):
```bash
cd apps/api
python -m pytest tests/test_graph.py -v
```

---

## 📄 License

MIT License. See [LICENSE](LICENSE) for details.
