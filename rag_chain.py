"""
rag_chain.py — Retrieval-Augmented Generation Chain (NVIDIA Exclusive)

Architecture:
- Retriever → Prompt → ChatNVIDIA (google/Gemma-4-3db-it | Minimax/minimaxm3) → Structured Output
- Zero external API dependencies beyond NVIDIA.
"""

import logging
from typing import Any, List

from langchain_nvidia_ai_endpoints import ChatNVIDIA
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough
from langchain_core.documents import Document

from config import (
    NVIDIA_API_KEY, 
    CHAT_MODEL, 
    TEMPERATURE, 
    TOP_P, 
    MAX_TOKENS,
    ALLOWED_MODELS
)

logger = logging.getLogger(__name__)


# ── Professional System Prompt ─────────────────────────────────────────────────
_SYSTEM_PROMPT = """You are an elite professional academic tutor. Your objective is to provide high-authority, structured, and academically rigorous answers.
Use ONLY the provided context. If information is missing, state it professionally.

STRICT FORMATTING GUIDELINES:
1. Tone: Formal, professional, and authoritative.
2. Structure:
   - Use **Bold Headings** for each section.
   - Use numbered lists for processes and bullet points for features/characteristics.
   - Maintain a clear hierarchy of information.
3. Layout:
   - Break long responses into concise paragraphs (2-4 sentences).
   - Ensure a blank line between every paragraph and section.
   - Never use "#" or "##" markdown headers; use **Bold Text** instead.
4. Quality:
   - Be direct and avoid filler phrases (e.g., "Based on the context provided...").
   - Start the answer immediately with the most important information.
   - Use professional academic terminology.
"""

_HUMAN_PROMPT = """Context from uploaded documents:
{context}

Student's Question: {question}

Provide a structured academic answer following the specified format."""


def _build_prompt() -> ChatPromptTemplate:
    return ChatPromptTemplate.from_messages([
        ("system", _SYSTEM_PROMPT),
        ("human", _HUMAN_PROMPT),
    ])


def _format_docs(docs: List[Document]) -> str:
    return "\n\n---\n\n".join(doc.page_content for doc in docs)


# ── Chain Construction ─────────────────────────────────────────────────────────
class QAChain:
    """Wraps retriever + NVIDIA LLM into callable agent interface with source tracking."""
    
    def __init__(self, retriever, llm, prompt):
        self._retriever = retriever
        self._llm = llm
        self._prompt = prompt

    def invoke(self, inputs: dict[str, Any]) -> dict[str, Any]:
        query = inputs.get("query", "")

        # Retrieve context
        docs = self._retriever.invoke(query)
        context = _format_docs(docs)

        # Generate Answer
        chain = self._prompt | self._llm | StrOutputParser()
        answer = chain.invoke({"context": context, "question": query})

        return {
            "result": answer,
            "source_documents": docs,
        }


def get_qa_chain(retriever) -> QAChain:
    """Build the complete QA chain: Retriever → NVIDIA LLM → Answer."""
    
    # Validate Model
    if CHAT_MODEL not in ALLOWED_MODELS:
        logger.warning(f"Model '{CHAT_MODEL}' not in allowlist. Falling back to '{ALLOWED_MODELS[0]}'")
        model_to_use = ALLOWED_MODELS[0]
    else:
        model_to_use = CHAT_MODEL

    # Initialize NVIDIA LLM (Only API Allowed)
    llm = ChatNVIDIA(
        model=model_to_use,
        api_key=NVIDIA_API_KEY,
        temperature=TEMPERATURE,
        top_p=TOP_P,
        max_tokens=MAX_TOKENS,
    )

    prompt = _build_prompt()
    chain = QAChain(retriever, llm, prompt)

    logger.info("QA Chain initialized | Model: %s | Provider: NVIDIA", model_to_use)
    return chain


# ── Source Attribution ─────────────────────────────────────────────────────────
def format_sources(source_documents: List[Document]) -> str:
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

        sources.append(
            f"- 📄 **{meta.get('source', 'Unknown')}**  \n"
            f"  Type: `{meta.get('doc_type', 'N/A')}` "
            f"| Page: **{meta.get('page', 'N/A')}** "
            f"| Chunk: {meta.get('chunk_index', 'N/A')}"
        )

    return "\n".join(sources)


def ask_question(chain: QAChain, question: str) -> dict:
    """Ask a question and return structured result with sources."""
    if not question or not question.strip():
        return {"answer": "Please enter a valid question.", "sources": "", "source_documents": []}

    try:
        result = chain.invoke({"query": question})
        return {
            "answer": result.get("result", "No answer generated."),
            "sources": format_sources(result.get("source_documents", [])),
            "source_documents": result.get("source_documents", []),
        }
    except Exception as e:
        logger.error("QA Chain execution error: %s", str(e), exc_info=True)
        return {
            "answer": f"An error occurred while generating the answer: {str(e)}",
            "sources": "",
            "source_documents": [],
        }