"""
Integration test for the full LangGraph pipeline.

Mocks all external I/O (LLM calls, retriever) so the test runs without
a database or API keys. Verifies the graph wires nodes correctly and
that state accumulates as expected.
"""
import sys
import os
import json
import types
from unittest.mock import MagicMock, patch

import pytest

# ── path setup ────────────────────────────────────────────────────────────────
# Allow imports like `from graph.xxx` when running from apps/api/
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

if "sentence_transformers" not in sys.modules:
    sys.modules["sentence_transformers"] = MagicMock()
if "pgvector" not in sys.modules:
    pgvector_mock = MagicMock()
    sys.modules["pgvector"] = pgvector_mock
    sys.modules["pgvector.sqlalchemy"] = pgvector_mock

import graph.nodes
import graph.graph


# ── fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def reset_llm_globals():
    """Reset graph.nodes LLM singletons before and after each test."""
    graph.nodes._llm_fast = None
    graph.nodes._llm_generate = None
    yield
    graph.nodes._llm_fast = None
    graph.nodes._llm_generate = None


def make_llm_response(content: str) -> MagicMock:
    """Minimal AIMessage-like mock."""
    msg = MagicMock()
    msg.content = content
    return msg


def make_retrieved_doc(idx: int, score: float = 0.9):
    """RetrievedDocument-like object returned by the retriever."""
    doc = MagicMock()
    doc.id = f"doc-{idx}"
    doc.content = f"Content of document {idx}."
    doc.source = f"file_{idx}.pdf"
    doc.score = score
    return doc


# ── the test ──────────────────────────────────────────────────────────────────

@patch("ingestion.retriever.embed_texts")
@patch("ingestion.retriever.cohere.ClientV2")
@patch("graph.nodes.ChatGoogleGenerativeAI")
def test_happy_path(MockLLMClass, MockCohere, mock_embed):
    """
    Happy path: retriever returns 3 docs, grader marks 2 relevant,
    generator produces an answer, hallucination checker says clean.

    Expected audit_log entries: retrieve, grade, generate, hallucination_check (4).
    The spec says 5 but routing decisions are not nodes — they produce no log entries.
    """

    # ── mock embed so retriever doesn't need a real model ─────────────────────
    mock_embed.return_value = [[0.1] * 768]

    # ── mock Cohere reranker to raise so retriever falls back to cosine ───────
    mock_cohere_instance = MagicMock()
    mock_cohere_instance.rerank.side_effect = Exception("mocked — use fallback")
    MockCohere.return_value = mock_cohere_instance

    # ── mock DB session ───────────────────────────────────────────────────────
    db = MagicMock()
    row1 = MagicMock(id="doc-1", content="Content of document 1.", source="file_1.pdf", score=0.9)
    row2 = MagicMock(id="doc-2", content="Content of document 2.", source="file_2.pdf", score=0.8)
    row3 = MagicMock(id="doc-3", content="Content of document 3.", source="file_3.pdf", score=0.3)
    db.execute.return_value.fetchall.return_value = [row1, row2, row3]

    # ── mock LLM responses ────────────────────────────────────────────────────
    # grade_documents_node calls llm.invoke() once per document.
    # hallucination_check_node calls llm.invoke() once.
    # We set up a single mock instance returned by both LLM constructors.
    llm_instance = MagicMock()

    grade_relevant   = make_llm_response(json.dumps({"grade": "relevant",   "reason": "on-topic", "reasoning": "yes"}))
    grade_irrelevant = make_llm_response(json.dumps({"grade": "irrelevant", "reason": "off-topic", "reasoning": "no"}))
    hallucination_ok = make_llm_response(json.dumps({
        "hallucinating": False,
        "confidence": 0.95,
        "explanation": "All claims are grounded in the provided sources.",
        "claims_checked": []
    }))

    # invoke call order: grade doc1, grade doc2, grade doc3, hallucination check
    llm_instance.invoke.side_effect = [
        grade_relevant,
        grade_relevant,
        grade_irrelevant,
        hallucination_ok,
    ]

    # generate_node uses a separate LLM instance (llm_generate); mock it too
    llm_generate_instance = MagicMock()
    llm_generate_instance.invoke.return_value = make_llm_response(
        "The answer is 42. [Source: file_1.pdf]"
    )

    # Both ChatGoogleGenerativeAI() calls return our mocks in order
    MockLLMClass.side_effect = [llm_instance, llm_generate_instance]

    # ── build and run the graph ───────────────────────────────────────────────
    from graph.graph import build_graph

    graph = build_graph(db)

    initial_state = {
        "question": "What is the answer?",
        "session_id": "sess-test",
        "query_id": "q-test",
        "retrieved_documents": [],
        "rewritten_question": None,
        "retry_count": 0,
        "regeneration_count": 0,
        "generation": None,
        "hallucination_detected": False,
        "confidence_score": 0.0,
        "audit_log": [],
        "web_search_needed": False,
    }

    final_state = graph.invoke(initial_state)

    # ── assertions ────────────────────────────────────────────────────────────

    # Generation must be non-empty
    assert final_state["generation"], "generation should be non-empty"
    assert "42" in final_state["generation"], "generation should contain mocked answer"

    # Audit log must have exactly 4 entries (one per node that ran)
    audit_steps = [entry["step"] for entry in final_state["audit_log"]]
    assert audit_steps == ["retrieve", "grade", "generate", "hallucination_check"], (
        f"Unexpected audit steps: {audit_steps}"
    )

    # 2 of 3 docs should be graded relevant
    relevant = [d for d in final_state["retrieved_documents"] if d.grade == "relevant"]
    assert len(relevant) == 2, f"Expected 2 relevant docs, got {len(relevant)}"

    # No hallucination detected
    assert not final_state["hallucination_detected"]
    assert final_state["confidence_score"] == pytest.approx(0.95)

    # No retries triggered
    assert final_state["retry_count"] == 0
    assert final_state["regeneration_count"] == 0


@patch("graph.nodes.TavilySearchResults")
@patch("ingestion.retriever.embed_texts")
@patch("ingestion.retriever.cohere.ClientV2")
@patch("graph.nodes.ChatGoogleGenerativeAI")
def test_web_search_fallback_trigger(MockLLMClass, MockCohere, mock_embed, MockTavilyTool):
    """
    Verifies that when vector search yields 0 relevant docs after retries are exhausted (retry_count >= MAX_RETRIES),
    the graph routes to web_search, fetches web snippets tagged as 'web', and generates an answer.
    """
    mock_embed.return_value = [[0.1] * 768]
    mock_cohere_instance = MagicMock()
    mock_cohere_instance.rerank.side_effect = Exception("mocked")
    MockCohere.return_value = mock_cohere_instance

    db = MagicMock()
    # 0 docs returned by DB
    db.execute.return_value.fetchall.return_value = []

    # Mock Tavily Search tool
    tool_instance = MagicMock()
    tool_instance.invoke.return_value = [
        {"content": "Tavily web search snippet about topic.", "url": "https://example.com/article"}
    ]
    MockTavilyTool.return_value = tool_instance

    llm_instance = MagicMock()
    hallucination_ok = make_llm_response(json.dumps({
        "hallucinating": False,
        "confidence": 0.9,
        "explanation": "Grounded in web search results.",
        "claims_checked": []
    }))
    llm_instance.invoke.return_value = hallucination_ok

    llm_generate_instance = MagicMock()
    llm_generate_instance.invoke.return_value = make_llm_response(
        "According to web search, topic details are here. [Source: https://example.com/article (web)]"
    )

    MockLLMClass.side_effect = [llm_instance, llm_generate_instance]

    from graph.graph import build_graph

    graph = build_graph(db)

    # Initial state with retry_count = 2 (max retries exhausted)
    initial_state = {
        "question": "What is the latest news on topic X?",
        "session_id": "sess-web",
        "query_id": "q-web",
        "retrieved_documents": [],
        "rewritten_question": "topic X news",
        "retry_count": 2,  # MAX_RETRIES exhausted!
        "regeneration_count": 0,
        "generation": None,
        "hallucination_detected": False,
        "confidence_score": 0.0,
        "audit_log": [],
        "web_search_needed": False,
    }

    with patch.dict(os.environ, {"TAVILY_API_KEY": "test-key"}):
        final_state = graph.invoke(initial_state)

    audit_steps = [entry["step"] for entry in final_state["audit_log"]]
    assert "web_search" in audit_steps, f"Expected web_search in audit steps, got: {audit_steps}"
    assert final_state["web_search_needed"] is True
    assert len(final_state["retrieved_documents"]) == 1
    assert final_state["retrieved_documents"][0].source_type == "web"
    assert final_state["retrieved_documents"][0].source == "https://example.com/article"


@patch("graph.nodes.TavilySearchResults")
@patch("ingestion.retriever.embed_texts")
@patch("ingestion.retriever.cohere.ClientV2")
@patch("graph.nodes.ChatGoogleGenerativeAI")
def test_web_search_empty_guardrail(MockLLMClass, MockCohere, mock_embed, MockTavilyTool):
    """
    Verifies refusal guardrail: if web_search returns 0 results as well, generate returns
    an explicit refusal message without attempting to hallucinate.
    """
    mock_embed.return_value = [[0.1] * 768]
    mock_cohere_instance = MagicMock()
    mock_cohere_instance.rerank.side_effect = Exception("mocked")
    MockCohere.return_value = mock_cohere_instance

    db = MagicMock()
    db.execute.return_value.fetchall.return_value = []

    # Mock Tavily returning 0 results
    tool_instance = MagicMock()
    tool_instance.invoke.return_value = []
    MockTavilyTool.return_value = tool_instance

    llm_instance = MagicMock()

    MockLLMClass.return_value = llm_instance

    from graph.graph import build_graph
    graph = build_graph(db)

    initial_state = {
        "question": "Nonexistent topic?",
        "session_id": "sess-empty",
        "query_id": "q-empty",
        "retrieved_documents": [],
        "rewritten_question": None,
        "retry_count": 2,
        "regeneration_count": 0,
        "generation": None,
        "hallucination_detected": False,
        "confidence_score": 0.0,
        "audit_log": [],
        "web_search_needed": False,
    }

    with patch.dict(os.environ, {"TAVILY_API_KEY": "test-key"}):
        final_state = graph.invoke(initial_state)

    assert "I could not find relevant information in the provided document corpus or web search" in final_state["generation"]


@patch("ingestion.retriever.embed_texts")
@patch("ingestion.retriever.cohere.ClientV2")
@patch("graph.nodes.ChatGoogleGenerativeAI")
def test_pgvector_success_no_web_search_regression(MockLLMClass, MockCohere, mock_embed):
    """
    Verifies non-regression: when pgvector yields relevant documents, web_search node is NEVER triggered.
    """
    mock_embed.return_value = [[0.1] * 768]
    mock_cohere_instance = MagicMock()
    mock_cohere_instance.rerank.side_effect = Exception("mocked")
    MockCohere.return_value = mock_cohere_instance

    db = MagicMock()
    row1 = MagicMock(id="doc-1", content="Matching content in vector DB.", source="manual.pdf", score=0.95)
    db.execute.return_value.fetchall.return_value = [row1]

    llm_instance = MagicMock()
    grade_relevant = make_llm_response(json.dumps({"grade": "relevant", "reason": "on-topic", "reasoning": "yes"}))
    hallucination_ok = make_llm_response(json.dumps({
        "hallucinating": False,
        "confidence": 0.98,
        "explanation": "Grounded.",
        "claims_checked": []
    }))
    llm_instance.invoke.side_effect = [grade_relevant, hallucination_ok]

    llm_generate_instance = MagicMock()
    llm_generate_instance.invoke.return_value = make_llm_response(
        "Answer from manual.pdf [Source: manual.pdf]"
    )

    MockLLMClass.side_effect = [llm_instance, llm_generate_instance]

    from graph.graph import build_graph
    graph = build_graph(db)

    initial_state = {
        "question": "Vector corpus query",
        "session_id": "sess-no-regress",
        "query_id": "q-no-regress",
        "retrieved_documents": [],
        "rewritten_question": None,
        "retry_count": 0,
        "regeneration_count": 0,
        "generation": None,
        "hallucination_detected": False,
        "confidence_score": 0.0,
        "audit_log": [],
        "web_search_needed": False,
    }

    final_state = graph.invoke(initial_state)

    audit_steps = [entry["step"] for entry in final_state["audit_log"]]
    assert "web_search" not in audit_steps, "web_search should NOT be executed when vector DB has relevant docs"
