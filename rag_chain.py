"""
rag_chain.py — Retrieval-Augmented Generation Chain

WHY THIS MODULE EXISTS:
    This is the AI brain of the system. It:
    1. Takes a user question + retrieved context chunks
    2. Constructs a carefully engineered prompt
    3. Sends it to the LLM (Groq)
    4. Returns a structured academic answer with source attribution

WHY LCEL (LangChain Expression Language):
    - Modern, composable approach replacing deprecated RetrievalQA
    - Explicit data flow: retriever → format → prompt → LLM → parse
    - Full control over source document tracking
    - Future-proof — LCEL is the current LangChain standard

WHY Groq:
    - Free tier with generous rate limits
    - llama-3.3-70b-versatile: strong reasoning, great for academic content
    - ~10x faster inference than OpenAI (custom LPU hardware)
"""

import logging
from typing import Any

from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough

from config import GROQ_API_KEY, MODEL_NAME, TEMPERATURE

logger = logging.getLogger(__name__)


# ── Prompt Engineering ───────────────────────────────────────────────────────

_SYSTEM_PROMPT = """You are an expert academic tutor and subject guide assistant.
Your role is to provide comprehensive, well-structured answers to academic questions
using ONLY the provided context from uploaded documents.

RULES:
1. Answer ONLY based on the provided context. If the context doesn't contain
   enough information, clearly state what's missing.
2. Be thorough but concise — every sentence should add value.
3. Use proper academic language appropriate for university students.
4. Include relevant examples from the context when available.
5. If the question relates to a question paper, identify the expected depth
   of answer based on marks allocation.

RESPONSE GUIDELINES:
- Structure your answer naturally based on what the question asks.
- Use **bold text** for important terms, headings, and key phrases.
- Use bullet points (- ) for listing items.
- Use numbered lists (1. 2. 3.) for sequential steps or ordered content.
- Break long answers into logical sections with bold headings.
- Keep paragraphs short (2-3 sentences max).
- Add a blank line between paragraphs and sections for readability.
- If applicable, include a brief example to illustrate the concept.
- If applicable, suggest a practice question at the end.
- Never use # or ## markdown headers. Use **bold text** for all headings.
- Adapt your answer style to the question — don't force a fixed template.
"""

_HUMAN_PROMPT = """Context from uploaded documents:
{context}

Student's Question: {question}

Provide a structured academic answer following the specified format."""


def _build_prompt() -> ChatPromptTemplate:
    """Build the chat prompt template with system and human messages."""
    return ChatPromptTemplate.from_messages(
        [
            ("system", _SYSTEM_PROMPT),
            ("human", _HUMAN_PROMPT),
        ]
    )


def _format_docs(docs: list) -> str:
    """Join retrieved document page_content into a single context string."""
    return "\n\n---\n\n".join(doc.page_content for doc in docs)


# ── Chain Construction ───────────────────────────────────────────────────────


class QAChain:
    """
    Wraps the retriever + LLM into a callable agent interface with source tracking.
    """

    def __init__(self, retriever, llm, prompt):
        self._retriever = retriever
        self._llm = llm

    def invoke(self, inputs: dict[str, Any]) -> dict[str, Any]:
        query = inputs.get("query", "")

        # Get documents list from Streamlit session state if available
        try:
            import streamlit as st
            processed = st.session_state.get("processed_files", [])
            documents = [{"name": name, "size": 0, "chunks": 0} for name in processed]
        except Exception:
            documents = []

        from agent import ReActAgent
        vector_store = getattr(self._retriever, "vectorstore", None)
        agent = ReActAgent(self._llm, vector_store, documents)
        
        result = agent.run(query)

        # Retrieve source documents for compatibility with original RAG output contract
        source_documents = []
        if vector_store:
            source_documents = self._retriever.invoke(query)

        return {
            "result": result.get("answer", "No answer generated."),
            "source_documents": source_documents,
        }


def get_qa_chain(retriever) -> QAChain:
    """
    Build the complete QA chain: retriever → prompt → LLM → answer.
    """
    if not GROQ_API_KEY:
        raise ValueError(
            "GROQ_API_KEY not set. Add it to your .env file. "
            "Get a free key at https://console.groq.com"
        )

    llm = ChatGroq(
        api_key=GROQ_API_KEY,
        model_name=MODEL_NAME,
        temperature=TEMPERATURE,
        max_tokens=2048,
    )

    prompt = _build_prompt()
    chain = QAChain(retriever, llm, prompt)

    logger.info("QA chain initialized with model: %s", MODEL_NAME)
    return chain


# ── Source Attribution ───────────────────────────────────────────────────────


def format_sources(source_documents: list) -> str:
    """Format source documents into a readable attribution string."""
    if not source_documents:
        return "No sources found."

    seen: set[str] = set()
    sources: list[str] = []

    for doc in source_documents:
        meta = doc.metadata
        source_key = f"{meta.get('source', 'Unknown')}|{meta.get('page', '?')}"

        if source_key in seen:
            continue
        seen.add(source_key)

        source_line = (
            f"- 📄 **{meta.get('source', 'Unknown')}**  \n"
            f"  Type: `{meta.get('doc_type', 'N/A')}` "
            f"| Page: **{meta.get('page', 'N/A')}** "
            f"| Chunk: {meta.get('chunk_index', 'N/A')}"
        )
        sources.append(source_line)

    return "\n".join(sources)


def ask_question(chain: QAChain, question: str) -> dict:
    """Ask a question and return structured result with sources."""
    if not question or not question.strip():
        return {
            "answer": "Please enter a valid question.",
            "sources": "",
            "source_documents": [],
        }

    try:
        result = chain.invoke({"query": question})

        return {
            "answer": result.get("result", "No answer generated."),
            "sources": format_sources(result.get("source_documents", [])),
            "source_documents": result.get("source_documents", []),
        }

    except Exception as e:
        logger.error("Error during QA chain execution: %s", str(e))
        return {
            "answer": f"An error occurred while generating the answer: {str(e)}",
            "sources": "",
            "source_documents": [],
        }
