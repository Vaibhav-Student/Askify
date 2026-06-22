"""
config.py — Centralized Configuration (NVIDIA Exclusive)

⚠️  MODEL LOCK — DO NOT MODIFY THESE MODEL STRINGS ⚠️
    CHAT_MODEL  : minimaxai/minimax-m3    (Chat feature)
    STUDY_MODEL : google/gemma-4-31b-it   (Study Hub feature)
"""

import os
from dotenv import load_dotenv

load_dotenv()

# ── NVIDIA API (Single Provider) ──────────────────────────────────────────────
NVIDIA_API_KEY: str = os.getenv(
    "NVIDIA_API_KEY",
    "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"
)

# ── 🔒 LOCKED Model Identifiers — DO NOT CHANGE ───────────────────────────────
CHAT_MODEL: str  = "minimaxai/minimax-m3"     # Chat feature — LOCKED
STUDY_MODEL: str = "google/gemma-4-31b-it"    # Study Hub feature — LOCKED

# ── Allowed Models ────────────────────────────────────────────────────────────
ALLOWED_MODELS: list[str] = [CHAT_MODEL, STUDY_MODEL]

# ── Generation Parameters ─────────────────────────────────────────────────────
TEMPERATURE: float = 0.3
TOP_P: float = 0.9
MAX_TOKENS: int = 2048

# ── Embedding (Local CPU) ─────────────────────────────────────────────────────
EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"

# ── Chunking ──────────────────────────────────────────────────────────────────
CHUNK_SIZE: int = 1000
CHUNK_OVERLAP: int = 200

# ── Vector Store ──────────────────────────────────────────────────────────────
FAISS_INDEX_DIR: str = "faiss_index"
TOP_K: int = 4

# ── File Upload ───────────────────────────────────────────────────────────────
UPLOAD_DIR: str = "uploaded_docs"
ALLOWED_EXTENSIONS: list[str] = [".pdf", ".docx"]
