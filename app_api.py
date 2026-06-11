from flask import Flask, request, jsonify, Response
from werkzeug.utils import secure_filename
import json
import io
import hashlib
import uuid
import os
import shutil
import time

# from document_loader import load_multiple_pdfs, load_pptx, load_xlsx
# from vector_store import create_vector_store
# from rag_engine import RAGEngine


import threading

app = Flask(__name__)

# ── Configuration ──
MAX_UPLOAD_SIZE = 500 * 1024 * 1024  # 500 MB
MAX_CHUNK_SIZE = 5 * 1024 * 1024     # 5 MB
CHUNK_DIR = os.path.join("data", "uploads", "chunks")
ALLOWED_EXTENSIONS = {
    "pdf", "docx", "doc", "pptx", "ppt", "xlsx", "xls", "txt", "md",
    "jpg", "jpeg", "png", "webp", "svg"
}
RATE_LIMIT_WINDOW = 60   # seconds
RATE_LIMIT_MAX = 30      # max chunk uploads per window per IP
SESSION_TTL = 3600       # 1 hour stale session timeout

GLOBAL_STATE = {
    "documents": [],
    "vector_store": None,
    "prewarm_cache": {},
    "study_engine": None,
    "chat_engine": None,
}

UPLOAD_SESSIONS = {}
RATE_LIMIT_STORE = {}
rate_lock = threading.Lock()

vs_lock = threading.Lock()

def rebuild_vector_store():
    from vector_store import create_vector_store
    with vs_lock:
        try:
            all_text = "\n\n".join([doc["text"] for doc in GLOBAL_STATE["documents"]])
            if all_text.strip():
                GLOBAL_STATE["vector_store"] = create_vector_store(all_text)
            else:
                GLOBAL_STATE["vector_store"] = None
        except Exception as e:
            app.logger.error(f"[Rebuild Vector Store Error] {e}", exc_info=True)
            # Don't let indexing errors crash the app/background tasks
            GLOBAL_STATE["vector_store"] = None

@app.errorhandler(Exception)
def handle_exception(e):
    app.logger.error(f"[Unhandled Error] {e}", exc_info=True)
    return jsonify({"error": "Internal Server Error", "details": str(e)}), 500

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})

@app.route("/api/api-key", methods=["GET", "POST"])
def api_key_route():
    """Legacy endpoint kept for backward compatibility."""
    if request.method == "POST":
        return jsonify({"message": "API Key saved successfully"})
    return jsonify({"has_key": True})

@app.route("/api/upload", methods=["POST"])
def upload():
    if 'file' not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    filename = secure_filename(file.filename)
    # secure_filename can strip non-ASCII names to empty
    if not filename:
        filename = "uploaded_file"

    try:
        from document_loader import load_multiple_pdfs, load_pptx, load_xlsx
        ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
        text = ""

        if ext == 'pdf':
            file_bytes = file.read()
            if not file_bytes:
                return jsonify({"error": "Uploaded file is empty"}), 400
            pdf_stream = io.BytesIO(file_bytes)
            try:
                text = load_multiple_pdfs([pdf_stream])
            except Exception as pdf_err:
                app.logger.error(f"[PDF Parse Error] {pdf_err}", exc_info=True)
                return jsonify({"error": f"Failed to parse PDF: {pdf_err}"}), 400
        elif ext in ['pptx', 'ppt']:
            file_bytes = file.read()
            if not file_bytes:
                return jsonify({"error": "Uploaded file is empty"}), 400
            file_stream = io.BytesIO(file_bytes)
            try:
                text = load_pptx(file_stream)
            except Exception as ppt_err:
                app.logger.error(f"[PPT Parse Error] {ppt_err}", exc_info=True)
                return jsonify({"error": f"Failed to parse PowerPoint: {ppt_err}"}), 400
        elif ext in ['xlsx', 'xls']:
            file_stream = io.BytesIO(file.read())
            try:
                text = load_xlsx(file_stream)
            except Exception as xls_err:
                app.logger.error(f"[Excel Parse Error] {xls_err}", exc_info=True)
                return jsonify({"error": f"Failed to parse Excel: {xls_err}"}), 400
        else:
            # Fallback for all other file types: Try to read as text, otherwise register as non-indexable
            raw = file.read()
            if not raw:
                return jsonify({"error": "Uploaded file is empty"}), 400
            try:
                text = raw.decode('utf-8')
            except (UnicodeDecodeError, Exception):
                try:
                    text = raw.decode('latin-1')
                except Exception:
                    # If it's binary or can't be decoded, we still register it
                    text = f"[Binary/Non-text content for {filename}]"

        if not text.strip():
            return jsonify({"error": "Could not extract text from the file (might be empty or scanned)"}), 400

        chunks_estimate = max(1, len(text) // 1000)

        GLOBAL_STATE["documents"] = [d for d in GLOBAL_STATE["documents"] if d["name"] != filename]
        GLOBAL_STATE["documents"].append({
            "name": filename,
            "text": text,
            "chunks": chunks_estimate,
            "size": len(text)
        })

        # Rebuild vector store in background — returns immediately
        threading.Thread(target=rebuild_vector_store, daemon=True).start()

        return jsonify({
            "message": f"Successfully processed {filename}",
            "chunks": chunks_estimate
        })

    except Exception as e:
        app.logger.error(f"[Upload Error] {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


# ═══════════════════════════════════════════════════
#  Chunked Upload System
# ═══════════════════════════════════════════════════

def _check_rate_limit(ip):
    now = time.time()
    with rate_lock:
        entries = RATE_LIMIT_STORE.get(ip, [])
        entries = [t for t in entries if now - t < RATE_LIMIT_WINDOW]
        if len(entries) >= RATE_LIMIT_MAX:
            return False
        entries.append(now)
        RATE_LIMIT_STORE[ip] = entries
        return True


def _validate_extension(filename):
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    return ext in ALLOWED_EXTENSIONS


def _process_assembled_file(filepath, filename):
    """Extract text from an assembled file, reusing existing loader logic."""
    from document_loader import load_multiple_pdfs, load_pptx, load_xlsx
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    text = ""

    with open(filepath, "rb") as fh:
        raw = fh.read()

    if not raw:
        raise ValueError("Assembled file is empty")

    if ext == "pdf":
        text = load_multiple_pdfs([io.BytesIO(raw)])
    elif ext in ("pptx", "ppt"):
        text = load_pptx(io.BytesIO(raw))
    elif ext in ("xlsx", "xls"):
        text = load_xlsx(io.BytesIO(raw))
    else:
        try:
            text = raw.decode("utf-8")
        except (UnicodeDecodeError, Exception):
            try:
                text = raw.decode("latin-1")
            except Exception:
                text = f"[Binary/Non-text content for {filename}]"

    return text


def _purge_stale_sessions():
    """Remove upload sessions older than SESSION_TTL."""
    now = time.time()
    stale_ids = [
        uid for uid, s in UPLOAD_SESSIONS.items()
        if now - s["created_at"] > SESSION_TTL
    ]
    for uid in stale_ids:
        session_dir = os.path.join(CHUNK_DIR, uid)
        if os.path.isdir(session_dir):
            shutil.rmtree(session_dir, ignore_errors=True)
        UPLOAD_SESSIONS.pop(uid, None)


@app.route("/api/upload/init", methods=["POST"])
def upload_init():
    _purge_stale_sessions()

    data = request.json or {}
    filename = data.get("filename", "").strip()
    total_size = data.get("total_size", 0)
    total_chunks = data.get("total_chunks", 0)
    content_type = data.get("content_type", "")

    if not filename:
        return jsonify({"error": "Filename is required"}), 400

    safe_name = secure_filename(filename) or "uploaded_file"

    if not _validate_extension(safe_name):
        return jsonify({
            "error": f"File type not allowed. Supported: {', '.join(sorted(ALLOWED_EXTENSIONS))} (Text & Images only)"
        }), 400

    if total_size > MAX_UPLOAD_SIZE:
        return jsonify({
            "error": f"File exceeds maximum size of {MAX_UPLOAD_SIZE // (1024 * 1024)} MB"
        }), 400

    if total_chunks < 1 or total_chunks > 100000:
        return jsonify({"error": "Invalid chunk count"}), 400

    upload_id = uuid.uuid4().hex
    session_dir = os.path.join(CHUNK_DIR, upload_id)
    os.makedirs(session_dir, exist_ok=True)

    UPLOAD_SESSIONS[upload_id] = {
        "filename": safe_name,
        "total_size": total_size,
        "total_chunks": total_chunks,
        "content_type": content_type,
        "received": set(),
        "created_at": time.time(),
    }

    return jsonify({"upload_id": upload_id, "filename": safe_name})


@app.route("/api/upload/chunk", methods=["POST"])
def upload_chunk():
    client_ip = request.remote_addr or "unknown"
    if not _check_rate_limit(client_ip):
        return jsonify({"error": "Rate limit exceeded. Try again shortly."}), 429

    upload_id = request.form.get("upload_id", "")
    chunk_index_str = request.form.get("chunk_index", "")
    chunk_hash = request.form.get("chunk_hash", "")

    if upload_id not in UPLOAD_SESSIONS:
        return jsonify({"error": "Invalid or expired upload session"}), 404

    session = UPLOAD_SESSIONS[upload_id]

    try:
        chunk_index = int(chunk_index_str)
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid chunk index"}), 400

    if chunk_index < 0 or chunk_index >= session["total_chunks"]:
        return jsonify({"error": "Chunk index out of range"}), 400

    if "chunk" not in request.files:
        return jsonify({"error": "No chunk data provided"}), 400

    chunk_file = request.files["chunk"]
    chunk_data = chunk_file.read()

    if len(chunk_data) > MAX_CHUNK_SIZE:
        return jsonify({"error": f"Chunk exceeds max size of {MAX_CHUNK_SIZE // (1024 * 1024)} MB"}), 400

    if chunk_hash:
        computed = hashlib.sha256(chunk_data).hexdigest()
        if computed != chunk_hash:
            return jsonify({
                "error": "Chunk integrity check failed",
                "expected": chunk_hash,
                "received": computed,
            }), 400

    chunk_path = os.path.join(CHUNK_DIR, upload_id, f"chunk_{chunk_index:06d}.bin")
    with open(chunk_path, "wb") as f:
        f.write(chunk_data)

    session["received"].add(chunk_index)

    return jsonify({
        "received": chunk_index,
        "verified": True,
        "total_received": len(session["received"]),
        "total_chunks": session["total_chunks"],
    })


@app.route("/api/upload/finalize", methods=["POST"])
def upload_finalize():
    data = request.json or {}
    upload_id = data.get("upload_id", "")

    if upload_id not in UPLOAD_SESSIONS:
        return jsonify({"error": "Invalid or expired upload session"}), 404

    session = UPLOAD_SESSIONS[upload_id]
    expected = set(range(session["total_chunks"]))
    missing = expected - session["received"]

    if missing:
        return jsonify({
            "error": "Missing chunks",
            "missing": sorted(missing),
        }), 400

    session_dir = os.path.join(CHUNK_DIR, upload_id)
    assembled_path = os.path.join(session_dir, session["filename"])

    try:
        with open(assembled_path, "wb") as out:
            for i in range(session["total_chunks"]):
                chunk_path = os.path.join(session_dir, f"chunk_{i:06d}.bin")
                with open(chunk_path, "rb") as cp:
                    out.write(cp.read())

        text = _process_assembled_file(assembled_path, session["filename"])

        if not text.strip():
            shutil.rmtree(session_dir, ignore_errors=True)
            UPLOAD_SESSIONS.pop(upload_id, None)
            return jsonify({"error": "Could not extract text from the file"}), 400

        chunks_estimate = max(1, len(text) // 1000)
        filename = session["filename"]

        GLOBAL_STATE["documents"] = [
            d for d in GLOBAL_STATE["documents"] if d["name"] != filename
        ]
        GLOBAL_STATE["documents"].append({
            "name": filename,
            "text": text,
            "chunks": chunks_estimate,
            "size": len(text),
        })

        # Rebuild in background
        threading.Thread(target=rebuild_vector_store, daemon=True).start()

        shutil.rmtree(session_dir, ignore_errors=True)
        UPLOAD_SESSIONS.pop(upload_id, None)

        return jsonify({
            "message": f"Successfully processed {filename}",
            "chunks": chunks_estimate,
        })

    except Exception as e:
        app.logger.error(f"[Finalize Error] {e}", exc_info=True)
        shutil.rmtree(session_dir, ignore_errors=True)
        UPLOAD_SESSIONS.pop(upload_id, None)
        return jsonify({"error": str(e)}), 500


@app.route("/api/upload/<upload_id>", methods=["DELETE"])
def upload_cancel(upload_id):
    if upload_id not in UPLOAD_SESSIONS:
        return jsonify({"error": "Upload session not found"}), 404

    session_dir = os.path.join(CHUNK_DIR, upload_id)
    if os.path.isdir(session_dir):
        shutil.rmtree(session_dir, ignore_errors=True)

    UPLOAD_SESSIONS.pop(upload_id, None)
    return jsonify({"message": "Upload cancelled"})


@app.route("/api/upload/status/<upload_id>", methods=["GET"])
def upload_status(upload_id):
    if upload_id not in UPLOAD_SESSIONS:
        return jsonify({"error": "Upload session not found"}), 404

    session = UPLOAD_SESSIONS[upload_id]
    return jsonify({
        "upload_id": upload_id,
        "filename": session["filename"],
        "total_chunks": session["total_chunks"],
        "received_chunks": len(session["received"]),
        "received": sorted(session["received"]),
    })


@app.route("/api/documents", methods=["GET"])
def get_documents():
    docs = []
    total_chunks = 0
    for doc in GLOBAL_STATE["documents"]:
        docs.append({
            "name": doc["name"],
            "chunks": doc["chunks"],
            "size_formatted": f"{doc['size'] // 1024} KB"
        })
        total_chunks += doc["chunks"]

    return jsonify({
        "documents": docs,
        "total_chunks": total_chunks
    })

@app.route("/api/documents/<filename>", methods=["DELETE"])
def delete_document(filename):
    initial_length = len(GLOBAL_STATE["documents"])
    GLOBAL_STATE["documents"] = [d for d in GLOBAL_STATE["documents"] if d["name"] != filename]

    if len(GLOBAL_STATE["documents"]) != initial_length:
        threading.Thread(target=rebuild_vector_store, daemon=True).start()
        return jsonify({"message": "Document deleted"})
    else:
        return jsonify({"error": "Document not found"}), 404

@app.route("/api/documents/search", methods=["GET"])
def search_documents():
    query = request.args.get("query", "").strip()
    if not query:
        return jsonify({"results": []})

    vs = GLOBAL_STATE.get("vector_store")
    if vs is None:
        return jsonify({"results": [], "info": "Vector store is empty. Please upload documents first."})

    try:
        # Retrieve top 5 matching chunks from the FAISS database
        docs = vs.similarity_search(query, k=5)
        results = []
        for doc in docs:
            results.append({
                "content": doc.page_content,
                "metadata": doc.metadata if doc.metadata else {}
            })
        return jsonify({"results": results})
    except Exception as e:
        app.logger.error(f"[Vector Search API Error] {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500

@app.route("/api/clear-history", methods=["POST"])
def clear_history():
    return jsonify({"message": "Chat history cleared"})

@app.route("/api/prewarm", methods=["POST"])
def prewarm():
    data = request.json or {}
    query = data.get("query", "").strip()

    if not query or len(query) < 4:
        return jsonify({"status": "ignored"}), 200

    def run_prewarm():
        try:
            from rag_engine import RAGEngine, select_model_for_query
            selected_model = select_model_for_query(query)
            engine = RAGEngine(
                GLOBAL_STATE["vector_store"],
                provider="nvidia",
                model_name=selected_model,
                api_key=""
            )
            if engine.vector_store:
                retriever = engine.vector_store.as_retriever(top_k=5)
                # Perform the vector database similarity search early
                docs = retriever.invoke(query)
                GLOBAL_STATE["prewarm_cache"][query.lower()] = docs
        except Exception as e:
            app.logger.error(f"[Prewarm Background Error] {e}")

    threading.Thread(target=run_prewarm, daemon=True).start()
    return jsonify({"status": "prewarming_started"})


@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.json or {}
    query = data.get("query", "").strip()

    if not query:
        return jsonify({"error": "Query cannot be empty"}), 400

    provider = "nvidia"
    model = "google/gemma-3n-e4b-it"
    api_key = ""

    prewarmed_docs = None
    q_lower = query.lower()
    prewarm_cache = GLOBAL_STATE.get("prewarm_cache", {})
    for cached_q, docs in list(prewarm_cache.items()):
        if q_lower.startswith(cached_q) or cached_q.startswith(q_lower):
            prewarmed_docs = docs
            prewarm_cache.pop(cached_q, None)
            break

    try:
        engine = GLOBAL_STATE.get("chat_engine")
        if not engine or not engine.llm:
            from rag_engine import RAGEngine
            engine = RAGEngine(
                GLOBAL_STATE["vector_store"],
                provider=provider,
                model_name=model,
                api_key=api_key
            )
            GLOBAL_STATE["chat_engine"] = engine
        else:
            engine.vector_store = GLOBAL_STATE["vector_store"]
            engine.api_key = api_key

        def generate():
            try:
                for chunk in engine.stream_generate_response(query, prewarmed_docs=prewarmed_docs):
                    yield chunk
            except Exception as e:
                yield f'data: {{"error": "{str(e)}"}}\n\n'

        response = Response(generate(), mimetype="text/event-stream")
        response.headers["Cache-Control"] = "no-cache"
        response.headers["X-Accel-Buffering"] = "no"
        return response

    except Exception as e:
        app.logger.error(f"[Chat Error] {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@app.route("/api/documents/content", methods=["GET"])
def get_document_content():
    filename = request.args.get("name", "").strip()
    if not filename:
        return jsonify({"error": "Document name is required"}), 400
        
    for doc in GLOBAL_STATE["documents"]:
        if doc["name"] == filename:
            return jsonify({
                "name": doc["name"],
                "text": doc["text"]
            })
            
    return jsonify({"error": "Document not found"}), 404

@app.route("/api/study/generate", methods=["POST"])
def generate_study_materials():
    data = request.json or {}
    material_type = data.get("type", "flashcards")
    filename = data.get("filename", "")
    
    doc_text = ""
    if filename:
        for doc in GLOBAL_STATE["documents"]:
            if doc["name"] == filename:
                doc_text = doc["text"]
                break
    else:
        if GLOBAL_STATE["documents"]:
            doc_text = GLOBAL_STATE["documents"][0]["text"]
            
    if not doc_text:
        return jsonify({"error": "No indexed documents found. Please upload a file first."}), 400
        
    sample_text = doc_text[:10000]
    
    if material_type == "flashcards":
        prompt = (
            f"Based on the following text, generate exactly 6 high-quality flashcards. "
            f"Format the output strictly as a minified JSON array of objects, where each object has 'question' and 'answer' fields. "
            f"Do not include markdown formatting, markdown wrappers, backticks, or any other explanations. Return ONLY the raw valid JSON.\n\nText:\n{sample_text}"
        )
    elif material_type == "quiz":
        prompt = (
            f"Based on the following text, generate exactly 5 multiple-choice questions. "
            f"Format the output strictly as a minified JSON array of objects, where each object has "
            f"'question', 'options' (an array of 4 string options), 'correctIndex' (0-indexed integer of the correct option), "
            f"and 'explanation' (why it is correct) fields. "
            f"Do not include markdown formatting, markdown wrappers, backticks, or any other explanations. Return ONLY the raw valid JSON.\n\nText:\n{sample_text}"
        )
    elif material_type == "roadmap":
        prompt = (
            f"Based on the following text, generate an academic study roadmap with exactly 4 milestones. "
            f"Format the output strictly as a minified JSON array of objects, where each object has "
            f"'title' (milestone title), 'description' (what to learn), and 'tasks' (an array of 3 specific action tasks) fields. "
            f"Do not include markdown formatting, markdown wrappers, backticks, or any other explanations. Return ONLY the raw valid JSON.\n\nText:\n{sample_text}"
        )
    else:
        return jsonify({"error": "Invalid material type"}), 400

    try:
        engine = GLOBAL_STATE.get("study_engine")
        if not engine or not engine.llm:
            from rag_engine import RAGEngine
            engine = RAGEngine(None, provider="nvidia", model_name="google/gemma-3n-e4b-it")
            GLOBAL_STATE["study_engine"] = engine
            
        if not engine.llm:
            return jsonify({"error": "LLM not initialized"}), 500
            
        from langchain_core.messages import SystemMessage, HumanMessage
        messages = [
            SystemMessage(content="You are a JSON generator. You output only raw, valid JSON arrays. Never output code blocks, markdown wrapper, or conversational filler."),
            HumanMessage(content=prompt)
        ]
        
        # Optimize speed by binding appropriate max_tokens constraints
        model = engine.llm
        if material_type == "flashcards":
            bound_llm = model.bind(max_tokens=250)
        elif material_type == "quiz":
            bound_llm = model.bind(max_tokens=400)
        elif material_type == "roadmap":
            bound_llm = model.bind(max_tokens=500)
        else:
            bound_llm = model
            
        response = bound_llm.invoke(messages)
        content = response.content.strip()
        
        if content.startswith("```json"):
            content = content.split("```json", 1)[1]
        if content.startswith("```"):
            content = content.split("```", 1)[1]
        if content.endswith("```"):
            content = content.rsplit("```", 1)[0]
        content = content.strip()
        
        parsed_json = json.loads(content)
        return jsonify({"data": parsed_json})
        
    except Exception as e:
        app.logger.error(f"[Study Gen Error] {e}", exc_info=True)
        return jsonify({"error": f"Failed to generate study materials: {str(e)}"}), 500


def warmup_app():
    # 1. Warm up HuggingFace embeddings (SentenceTransformer)
    try:
        print("[Warmup] Starting background eager model loading...", flush=True)
        from vector_store import get_embeddings
        get_embeddings()
        print("[Warmup] Embedding model loaded and cached successfully.", flush=True)
    except Exception as e:
        print(f"[Warmup Warning] Embedding warmup encountered an error: {e}", flush=True)
        
    # 2. Warm up Gemma (DNS, TCP, SSL, and Nvidia session)
    try:
        from rag_engine import RAGEngine
        engine = RAGEngine(None, provider="nvidia", model_name="google/gemma-3n-e4b-it")
        if engine.llm:
            print("[Warmup] Sending a tiny test prompt to Gemma to warm up connection...", flush=True)
            engine.llm.invoke("Hi", max_tokens=1)
            GLOBAL_STATE["study_engine"] = engine
            print("[Warmup] Gemma client initialized, warmed, and TCP/SSL handshakes established. Stored in GLOBAL_STATE.", flush=True)
    except Exception as e:
        print(f"[Warmup Warning] Gemma warmup encountered an error: {e}", flush=True)

if __name__ == "__main__":
    # Warm up all models and connections synchronously before starting the web server
    warmup_app()
    app.run(host="0.0.0.0", port=7860, debug=True, use_reloader=False)

