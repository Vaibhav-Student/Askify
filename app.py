"""
app.py — Streamlit Frontend for AI Subject Guide & Question Bank

WHY STREAMLIT:
    - Fastest way to build data/AI app interfaces in Python
    - Built-in file uploader, progress bars, session state
    - Hot-reload for rapid development

ARCHITECTURE:
    app.py is the Controller layer. It handles:
    - User interaction (file upload, question input)
    - Orchestrating calls to document_loader, vector_store, rag_chain
    - Displaying results
    It contains ZERO business logic — all AI logic lives in the modules.
"""

import os
import tempfile
import logging

import streamlit as st

from config import UPLOAD_DIR, ALLOWED_EXTENSIONS, GROQ_API_KEY
from document_loader import load_and_chunk
from vector_store import (
    create_or_update_vector_store,
    load_vector_store,
    get_retriever,
    delete_vector_store,
)
from rag_chain import get_qa_chain, ask_question

# ── Logging Setup ────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(name)s | %(levelname)s | %(message)s",
)
logger = logging.getLogger(__name__)

# ── Page Configuration ───────────────────────────────────────────────────────
st.set_page_config(
    page_title="AI Subject Guide & Question Bank",
    page_icon="📚",
    layout="wide",
    initial_sidebar_state="expanded",
)


# ── Session State Initialization ─────────────────────────────────────────────
# WHY session_state: Streamlit reruns the entire script on every interaction.
# session_state persists data across reruns without re-computation.

def _init_session_state() -> None:
    """Initialize session state variables on first run."""
    defaults = {
        "vector_store": None,
        "qa_chain": None,
        "processed_files": [],
        "chat_history": [],
    }
    for key, value in defaults.items():
        if key not in st.session_state:
            st.session_state[key] = value


_init_session_state()


# ── Try Loading Existing Vector Store on Startup ─────────────────────────────
# WHY: If user previously uploaded documents and restarts the app,
# we want their data to be immediately available.

if st.session_state.vector_store is None:
    existing_store = load_vector_store()
    if existing_store is not None:
        st.session_state.vector_store = existing_store
        if GROQ_API_KEY:
            retriever = get_retriever(existing_store)
            st.session_state.qa_chain = get_qa_chain(retriever)


# ══════════════════════════════════════════════════════════════════════════════
#  SIDEBAR — Document Upload & Management
# ══════════════════════════════════════════════════════════════════════════════

with st.sidebar:
    st.header("📁 Document Upload")
    st.caption("Upload PDF or DOCX academic documents to build your knowledge base.")

    # ── API Key Check ────────────────────────────────────────────────────
    if not GROQ_API_KEY:
        st.warning(
            "⚠️ **GROQ_API_KEY not found.**\n\n"
            "1. Get a free key at [console.groq.com](https://console.groq.com)\n"
            "2. Create a `.env` file in the project root\n"
            "3. Add: `GROQ_API_KEY=gsk_your_key_here`\n"
            "4. Restart the app"
        )

    # ── File Uploader ────────────────────────────────────────────────────
    uploaded_files = st.file_uploader(
        "Choose files",
        type=["pdf", "docx"],
        accept_multiple_files=True,
        help="Upload academic PDFs or DOCX files. Multiple files supported.",
    )

    # ── Process Button ───────────────────────────────────────────────────
    if uploaded_files and st.button("🚀 Process Documents", use_container_width=True):
        # Ensure upload directory exists
        os.makedirs(UPLOAD_DIR, exist_ok=True)

        all_chunks = []
        progress_bar = st.progress(0)
        status_text = st.empty()

        for i, uploaded_file in enumerate(uploaded_files):
            file_name = uploaded_file.name
            status_text.text(f"📄 Processing: {file_name}")

            # Save uploaded file to disk temporarily
            file_path = os.path.join(UPLOAD_DIR, file_name)
            with open(file_path, "wb") as f:
                f.write(uploaded_file.getbuffer())

            try:
                # Step 1: Extract and chunk
                chunks = load_and_chunk(file_path)

                if chunks:
                    all_chunks.extend(chunks)
                    doc_type = chunks[0].metadata.get("doc_type", "general")

                    st.success(
                        f"✅ **{file_name}**\n"
                        f"   Type: `{doc_type}` | Chunks: {len(chunks)}"
                    )

                    # Track processed files
                    if file_name not in st.session_state.processed_files:
                        st.session_state.processed_files.append(file_name)
                else:
                    st.warning(f"⚠️ No text extracted from {file_name}")

            except Exception as e:
                st.error(f"❌ Error processing {file_name}: {str(e)}")
                logger.error("Error processing %s: %s", file_name, str(e))

            # Update progress
            progress_bar.progress((i + 1) / len(uploaded_files))

        # Step 2: Build/update vector store
        if all_chunks:
            status_text.text("🔢 Generating embeddings & building vector index...")

            try:
                vector_store = create_or_update_vector_store(all_chunks)
                st.session_state.vector_store = vector_store

                # Step 3: Initialize QA chain
                if GROQ_API_KEY:
                    retriever = get_retriever(vector_store)
                    st.session_state.qa_chain = get_qa_chain(retriever)
                    status_text.text("✅ Ready! Ask questions below.")
                else:
                    status_text.text("⚠️ Set GROQ_API_KEY to enable Q&A.")

            except Exception as e:
                st.error(f"❌ Error building vector store: {str(e)}")
                logger.error("Vector store error: %s", str(e))
        else:
            status_text.text("⚠️ No documents processed successfully.")

        progress_bar.empty()

    # ── Knowledge Base Info ──────────────────────────────────────────────
    st.divider()
    st.subheader("📊 Knowledge Base")

    if st.session_state.processed_files:
        st.write(f"**Documents indexed:** {len(st.session_state.processed_files)}")
        for fname in st.session_state.processed_files:
            st.write(f"  • {fname}")
    elif st.session_state.vector_store is not None:
        st.info("📦 Loaded existing knowledge base from disk.")
    else:
        st.info("No documents uploaded yet.")

    # ── Reset Button ─────────────────────────────────────────────────────
    st.divider()
    if st.button("🗑️ Reset Knowledge Base", use_container_width=True):
        delete_vector_store()
        st.session_state.vector_store = None
        st.session_state.qa_chain = None
        st.session_state.processed_files = []
        st.session_state.chat_history = []
        st.success("Knowledge base cleared.")
        st.rerun()


# ══════════════════════════════════════════════════════════════════════════════
#  MAIN — Question & Answer Interface
# ══════════════════════════════════════════════════════════════════════════════

st.title("📚 AI Subject Guide & Question Bank")
st.caption(
    "Upload academic documents in the sidebar, then ask questions to get "
    "structured answers with source attribution."
)

# ── Check Readiness ──────────────────────────────────────────────────────────
if st.session_state.qa_chain is None:
    st.info(
        "👈 **Upload documents** in the sidebar to get started.\n\n"
        "Supported formats: **PDF**, **DOCX**\n\n"
        "The system will:\n"
        "1. Extract text from your documents\n"
        "2. Detect document type (notes, question paper, lab manual)\n"
        "3. Build a searchable knowledge base\n"
        "4. Answer your questions with structured academic responses"
    )
    st.stop()

# ── Chat History Display ─────────────────────────────────────────────────────
# WHY chat history: Students often ask follow-up questions.
# Displaying history provides context and continuity.

for entry in st.session_state.chat_history:
    with st.chat_message("user"):
        st.write(entry["question"])
    with st.chat_message("assistant"):
        st.markdown(entry["answer"])
        if entry.get("sources"):
            with st.expander("📑 Sources Used"):
                st.markdown(entry["sources"])

# ── Question Input ───────────────────────────────────────────────────────────
question = st.chat_input("Ask a question about your documents...")

if question:
    # Display user question
    with st.chat_message("user"):
        st.write(question)

    # Generate answer
    with st.chat_message("assistant"):
        with st.spinner("🔍 Searching documents & generating answer..."):
            result = ask_question(st.session_state.qa_chain, question)

        # Display structured answer
        st.markdown(result["answer"])

        # Display source attribution
        if result["sources"]:
            with st.expander("📑 Sources Used", expanded=False):
                st.markdown(result["sources"])

    # Save to chat history
    st.session_state.chat_history.append(
        {
            "question": question,
            "answer": result["answer"],
            "sources": result["sources"],
        }
    )
