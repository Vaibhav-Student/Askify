"""
Document Processor Module
Uses LangChain document loaders and text splitters for PDF/TXT ingestion.
"""

import os
import uuid
from langchain_community.document_loaders import PyPDFLoader, TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter


class DocumentProcessor:
    """Processes uploaded documents into LangChain Document chunks with metadata."""

    def __init__(self, chunk_size=1000, chunk_overlap=150):
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            separators=["\n\n", "\n", ". ", " ", ""],
            length_function=len,
        )

    def process_file(self, file_path: str) -> list[dict]:
        """
        Process a file using LangChain loaders and return chunked documents.

        Args:
            file_path: Path to the uploaded file

        Returns:
            List of dicts with keys: 'id', 'text', 'metadata'
        """
        ext = os.path.splitext(file_path)[1].lower()
        filename = os.path.basename(file_path)

        # ── LangChain Document Loaders ──
        if ext == '.pdf':
            loader = PyPDFLoader(file_path)
        elif ext == '.txt':
            loader = TextLoader(file_path, encoding='utf-8', autodetect_encoding=True)
        else:
            raise ValueError(f"Unsupported file type: {ext}")

        # Load raw documents (each page is a separate Document for PDFs)
        raw_docs = loader.load()

        # ── LangChain Text Splitter ──
        split_docs = self.text_splitter.split_documents(raw_docs)

        # Convert to the dict format expected by the rest of the app
        chunks = []
        for doc in split_docs:
            text = doc.page_content.strip()
            if not text:
                continue

            page = doc.metadata.get('page', 0) + 1  # PyPDF uses 0-indexed pages
            chunks.append({
                'id': str(uuid.uuid4()),
                'text': text,
                'metadata': {
                    'source': filename,
                    'page': page,
                    'chunk_index': len(chunks),
                }
            })

        return chunks
