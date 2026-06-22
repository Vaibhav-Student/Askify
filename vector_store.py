"""
vector_store.py — FAISS Vector Store Manager

Supports both:
1. In-memory temporary FAISS indexes (for app_api.py)
2. Disk-persisted incremental FAISS indexes (for app.py)
"""

import os
import logging
import threading
from pathlib import Path

from langchain_core.documents import Document
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_text_splitters import RecursiveCharacterTextSplitter

from config import EMBEDDING_MODEL, FAISS_INDEX_DIR, TOP_K

logger = logging.getLogger(__name__)

# ── Embedding Model Singleton ────────────────────────────────────────────────
# Loaded once and shared across all threads/operations.

_embeddings = None
_embeddings_lock = threading.Lock()


def get_embeddings() -> HuggingFaceEmbeddings:
    """Get or lazily initialize the thread-safe HuggingFace embedding model."""
    global _embeddings
    if _embeddings is not None:
        return _embeddings

    with _embeddings_lock:
        if _embeddings is None:
            logger.info("Loading embedding model: %s", EMBEDDING_MODEL)
            _embeddings = HuggingFaceEmbeddings(
                model_name=EMBEDDING_MODEL,
                model_kwargs={"device": "cpu"},
                encode_kwargs={"normalize_embeddings": True},
            )
            logger.info("Embedding model loaded successfully")
    return _embeddings


# ── In-Memory Vector Store Operations (used by app_api.py) ───────────────────

def create_vector_store(docs: list | str) -> FAISS | None:
    """Create a temporary, in-memory FAISS index from a list of document dicts, preserving source/page metadata."""
    langchain_docs = []
    
    # Handle string input for safety / compatibility
    if isinstance(docs, str):
        docs = [{"name": "Unknown", "text": docs}]

    for doc in docs:
        name = doc.get("name", "Unknown")
        pages = doc.get("pages")
        if not pages:
            # Fallback if pages not populated
            pages = [{"text": doc.get("text", ""), "page": 1}]
            
        for page in pages:
            page_text = page.get("text", "")
            page_num = page.get("page", 1)
            if page_text.strip():
                langchain_docs.append(
                    Document(
                        page_content=page_text,
                        metadata={
                            "source": name,
                            "page": page_num
                        }
                    )
                )

    if not langchain_docs:
        return None

    # Split documents into chunks using RecursiveCharacterTextSplitter
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=500,
        chunk_overlap=100
    )
    chunks = text_splitter.split_documents(langchain_docs)
    
    # Add chunk index for extra trace details
    for idx, chunk in enumerate(chunks):
        chunk.metadata["chunk_index"] = idx

    # Get embeddings and build FAISS index
    embeddings = get_embeddings()
    vector_store = FAISS.from_documents(chunks, embeddings)
    return vector_store


def search_vector_store(vector_store: FAISS, query: str) -> list[Document]:
    """Retrieve top-3 documents matching the query from an in-memory vector store."""
    return vector_store.similarity_search(query, k=3)


# ── Disk-Persisted Vector Store Operations (used by app.py) ──────────────────

def create_or_update_vector_store(documents: list[Document]) -> FAISS:
    """
    Create a new FAISS index from documents, or merge into an existing one.
    Persists results to disk.
    """
    embeddings = get_embeddings()

    # Build a new FAISS index from the incoming documents
    new_store = FAISS.from_documents(documents, embeddings)
    logger.info("Created FAISS index with %d new document chunks", len(documents))

    # Check if a persisted index already exists
    index_path = Path(FAISS_INDEX_DIR)
    if index_path.exists() and (index_path / "index.faiss").exists():
        logger.info("Found existing FAISS index — merging new documents")
        existing_store = FAISS.load_local(
            FAISS_INDEX_DIR,
            embeddings,
            allow_dangerous_deserialization=True,
        )
        existing_store.merge_from(new_store)
        existing_store.save_local(FAISS_INDEX_DIR)
        logger.info("Merged and saved updated index to '%s'", FAISS_INDEX_DIR)
        return existing_store

    # No existing index — save the new one
    new_store.save_local(FAISS_INDEX_DIR)
    logger.info("Saved new FAISS index to '%s'", FAISS_INDEX_DIR)
    return new_store


def load_vector_store() -> FAISS | None:
    """Load a previously persisted FAISS index from disk."""
    index_path = Path(FAISS_INDEX_DIR)
    if not index_path.exists() or not (index_path / "index.faiss").exists():
        logger.info("No existing FAISS index found at '%s'", FAISS_INDEX_DIR)
        return None

    embeddings = get_embeddings()
    store = FAISS.load_local(
        FAISS_INDEX_DIR,
        embeddings,
        allow_dangerous_deserialization=True,
    )
    logger.info("Loaded existing FAISS index from '%s'", FAISS_INDEX_DIR)
    return store


def get_retriever(vector_store: FAISS):
    """Create a LangChain retriever from the FAISS store."""
    return vector_store.as_retriever(
        search_type="similarity",
        search_kwargs={"k": TOP_K},
    )


def delete_vector_store() -> bool:
    """Delete the persisted FAISS index from disk."""
    index_path = Path(FAISS_INDEX_DIR)
    if index_path.exists():
        import shutil
        shutil.rmtree(index_path)
        logger.info("Deleted FAISS index at '%s'", FAISS_INDEX_DIR)
        return True
    return False
