from flask import Flask, request, jsonify, Response, send_from_directory
from werkzeug.utils import secure_filename
import json
import io
import hashlib
import uuid
import os
import shutil
import time
import warnings

warnings.filterwarnings("ignore", category=UserWarning, module="langchain_nvidia_ai_endpoints")

import threading

from config import CHAT_MODEL, STUDY_MODEL, ALLOWED_MODELS, NVIDIA_API_KEY

STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static_react')
app = Flask(__name__, static_folder=STATIC_DIR, static_url_path='')

# ── Configuration ──
MAX_UPLOAD_SIZE = 500 * 1024 * 1024  # 500 MB
MAX_CHUNK_SIZE = 5 * 1024 * 1024     # 5 MB
CHUNK_DIR = os.path.join("data", "uploads", "chunks")
ALLOWED_EXTENSIONS = {
    "pdf", "docx", "doc", "pptx", "ppt", "xlsx", "xls", "txt", "md"
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
            if GLOBAL_STATE["documents"]:
                GLOBAL_STATE["vector_store"] = create_vector_store(GLOBAL_STATE["documents"])
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
        from document_loader import extract_text_and_pages
        file_bytes = file.read()
        if not file_bytes:
            return jsonify({"error": "Uploaded file is empty"}), 400
            
        text, pages = extract_text_and_pages(file_bytes, filename)

        if not text.strip():
            return jsonify({"error": "Could not extract text from the file (might be empty or scanned)"}), 400

        chunks_estimate = max(1, len(text) // 1000)

        GLOBAL_STATE["documents"] = [d for d in GLOBAL_STATE["documents"] if d["name"] != filename]
        GLOBAL_STATE["documents"].append({
            "name": filename,
            "text": text,
            "pages": pages,
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
    """Extract text and pages from an assembled file, reusing existing loader logic."""
    from document_loader import extract_text_and_pages
    with open(filepath, "rb") as fh:
        raw = fh.read()

    if not raw:
        raise ValueError("Assembled file is empty")

    return extract_text_and_pages(raw, filename)


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
            "error": f"File type not allowed. Supported: {', '.join(sorted(ALLOWED_EXTENSIONS))} (Text documents only — no images)"
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

        text, pages = _process_assembled_file(assembled_path, session["filename"])

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
            "pages": pages,
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
            from rag_engine import RAGEngine
            engine = RAGEngine(
                GLOBAL_STATE["vector_store"],
                model_name=CHAT_MODEL,
            )
            if engine.vector_store:
                retriever = engine.vector_store.as_retriever(top_k=5)
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
    model = CHAT_MODEL
    api_key = NVIDIA_API_KEY

    prewarmed_docs = None
    q_lower = query.lower()
    prewarm_cache = GLOBAL_STATE.get("prewarm_cache", {})
    for cached_q, docs in list(prewarm_cache.items()):
        if q_lower.startswith(cached_q) or cached_q.startswith(q_lower):
            prewarmed_docs = docs
            prewarm_cache.pop(cached_q, None)
            break

    try:
        # Ensure engine exists, create on-demand if warmup hasn't completed
        engine = GLOBAL_STATE.get("chat_engine")
        if not engine or not engine.llm:
            # Brief wait for warmup to complete (max 2 seconds)
            import time
            for _ in range(20):
                engine = GLOBAL_STATE.get("chat_engine")
                if engine and engine.llm:
                    break
                time.sleep(0.1)
            # If still not ready, create on-demand
            if not engine or not engine.llm:
                from rag_engine import RAGEngine
                engine = RAGEngine(
                    GLOBAL_STATE["vector_store"],
                    model_name=model,
                )
                GLOBAL_STATE["chat_engine"] = engine
        else:
            engine.vector_store = GLOBAL_STATE["vector_store"]

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
        
    sample_text = doc_text[:4000]
    
    if material_type == "flashcards":
        prompt = (
            f"Based on the following text, generate exactly 4 high-quality flashcards. "
            f"Format the output strictly as a minified JSON array of objects, where each object has 'question' and 'answer' fields. "
            f"Do not include markdown formatting, markdown wrappers, backticks, or any other explanations. Return ONLY the raw valid JSON.\n\nText:\n{sample_text}"
        )
    elif material_type == "quiz":
        prompt = (
            f"Based on the following text, generate exactly 3 multiple-choice questions. "
            f"Format the output strictly as a minified JSON array of objects, where each object has "
            f"'question', 'options' (an array of 4 string options), 'correctIndex' (0-indexed integer of the correct option), "
            f"and 'explanation' (why it is correct) fields. "
            f"Do not include markdown formatting, markdown wrappers, backticks, or any other explanations. Return ONLY the raw valid JSON.\n\nText:\n{sample_text}"
        )
    elif material_type == "roadmap":
        prompt = (
            f"Based on the following text, generate an academic study roadmap with exactly 3 milestones. "
            f"Format the output strictly as a minified JSON array of objects, where each object has "
            f"'title' (milestone title), 'description' (what to learn), and 'tasks' (an array of 3 specific action tasks) fields. "
            f"Do not include markdown formatting, markdown wrappers, backticks, or any other explanations. Return ONLY the raw valid JSON.\n\nText:\n{sample_text}"
        )
    else:
        return jsonify({"error": "Invalid material type"}), 400

    def build_local_study_materials():
        import re

        sentences = [
            re.sub(r"\s+", " ", s).strip()
            for s in re.split(r"(?<=[.!?])\s+|\n+", sample_text)
            if len(re.sub(r"\s+", " ", s).strip()) > 35
        ]
        if not sentences:
            sentences = [re.sub(r"\s+", " ", sample_text).strip() or "Review the uploaded document."]

        def short(text, limit=180):
            return text if len(text) <= limit else text[:limit].rsplit(" ", 1)[0] + "..."

        if material_type == "flashcards":
            cards = []
            for idx, sentence in enumerate((sentences * 4)[:4], start=1):
                cards.append({
                    "question": f"What is key point {idx} from this document?",
                    "answer": short(sentence, 220),
                })
            return cards

        if material_type == "quiz":
            quiz_items = []
            for idx, sentence in enumerate((sentences * 3)[:3], start=1):
                quiz_items.append({
                    "question": f"Which statement best matches key point {idx}?",
                    "options": [
                        short(sentence, 160),
                        "This topic is unrelated to the uploaded material.",
                        "The document does not discuss this concept.",
                        "This point should be ignored during revision.",
                    ],
                    "correctIndex": 0,
                    "explanation": "This option is taken from the indexed document text.",
                })
            return quiz_items

        milestones = []
        for idx, sentence in enumerate((sentences * 3)[:3], start=1):
            milestones.append({
                "title": f"Milestone {idx}",
                "description": short(sentence, 180),
                "tasks": [
                    "Read the related section carefully.",
                    "Write short notes in your own words.",
                    "Practice two questions from this concept.",
                ],
            })
        return milestones

    try:
        engine = GLOBAL_STATE.get("study_engine")
        if not engine or not engine.llm:
            # Brief wait for warmup to complete (max 2 seconds)
            import time
            for _ in range(20):
                engine = GLOBAL_STATE.get("study_engine")
                if engine and engine.llm:
                    break
                time.sleep(0.1)
            # If still not ready, create on-demand
            if not engine or not engine.llm:
                from rag_engine import RAGEngine
                engine = RAGEngine(None, model_name=STUDY_MODEL)
                GLOBAL_STATE["study_engine"] = engine
        
        if not engine.llm:
            return jsonify({"error": "LLM not initialized"}), 500
            
        from langchain_core.messages import SystemMessage, HumanMessage
        messages = [
            SystemMessage(content="You are a JSON generator. You output only raw, valid JSON arrays. Never output code blocks, markdown wrapper, or conversational filler."),
            HumanMessage(content=prompt)
        ]
        
        try:
            response = engine.llm.invoke(messages)
        except Exception as invoke_err:
            app.logger.warning(f"[Study Gen Warning] Primary model invocation failed: {invoke_err}. Using local materials.")
            return jsonify({"data": build_local_study_materials(), "fallback": True})

        content = response.content.strip()
        
        # Robust extract and parse JSON helper
        def extract_and_parse_json(text):
            import re
            text = text.strip()
            
            # Remove markdown code blocks if present
            match = re.search(r"```(?:json)?\s*(.*?)\s*```", text, re.DOTALL)
            if match:
                candidate = match.group(1).strip()
            else:
                candidate = text
                
            # Locate actual JSON structure
            first_idx = min([candidate.find(c) for c in ['[', '{'] if candidate.find(c) != -1], default=-1)
            last_idx = max([candidate.rfind(c) for c in [']', '}'] if candidate.rfind(c) != -1], default=-1)
            
            if first_idx != -1 and last_idx != -1 and first_idx < last_idx:
                candidate = candidate[first_idx:last_idx+1]
                
            candidate = candidate.strip()
            
            # Auto-close truncated JSON
            if candidate.startswith('[') and not candidate.endswith(']'):
                last_obj_end = candidate.rfind('}')
                if last_obj_end != -1:
                    candidate = candidate[:last_obj_end+1] + ']'
                else:
                    candidate += ']'
            elif candidate.startswith('{') and not candidate.endswith('}'):
                candidate += '}'
                
            # Clean trailing commas
            candidate = re.sub(r',\s*([\]}])', r'\1', candidate)
            
            try:
                return json.loads(candidate)
            except Exception as e:
                try:
                    return json.loads(text)
                except Exception:
                    raise e

        try:
            parsed_json = extract_and_parse_json(content)
        except Exception as parse_err:
            app.logger.warning(f"[Study Gen Warning] Could not parse model JSON: {parse_err}. Using local generated materials.")
            parsed_json = build_local_study_materials()
        return jsonify({"data": parsed_json})
        
    except Exception as e:
        app.logger.error(f"[Study Gen Error] {e}", exc_info=True)
        return jsonify({"data": build_local_study_materials(), "fallback": True})


def warmup_app():
    print("[Warmup] Skipping eager embedding load. Model will load lazily.", flush=True)

    # 2. Warm up Chat Engine
    try:
        from rag_engine import RAGEngine
        engine_chat = RAGEngine(None, model_name=CHAT_MODEL)
        GLOBAL_STATE["chat_engine"] = engine_chat
        print(f"[Warmup] Chat: {CHAT_MODEL} initialized.", flush=True)
    except Exception as e:
        print(f"[Warmup] Chat {CHAT_MODEL} failed: {e}", flush=True)

    # 3. Warm up Study Engine
    try:
        from rag_engine import RAGEngine
        engine_study = RAGEngine(None, model_name=STUDY_MODEL)
        GLOBAL_STATE["study_engine"] = engine_study
        print(f"[Warmup] Study: {STUDY_MODEL} initialized.", flush=True)
    except Exception as e:
        print(f"[Warmup] Study {STUDY_MODEL} failed: {e}", flush=True)

    GLOBAL_STATE["warmup_complete"] = True
    print("[Warmup] Complete.", flush=True)


@app.route("/api/health", methods=["GET"])
def health_check():
    """Health/readiness check for frontend to know when backend is ready."""
    warmup_done = GLOBAL_STATE.get("warmup_complete", False)
    chat_ready = GLOBAL_STATE.get("chat_engine") is not None
    study_ready = GLOBAL_STATE.get("study_engine") is not None
    return jsonify({
        "status": "ready" if warmup_done else "warming_up",
        "warmup_complete": warmup_done,
        "chat_engine_ready": chat_ready,
        "study_engine_ready": study_ready,
    })

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_frontend(path):
    """Serve the React SPA; fall back to index.html for client-side routing."""
    target = os.path.join(STATIC_DIR, path)
    if path and os.path.isfile(target):
        return send_from_directory(STATIC_DIR, path)
    return send_from_directory(STATIC_DIR, 'index.html')


if __name__ == "__main__":
    threading.Thread(target=warmup_app, daemon=True).start()
    port = int(os.environ.get("PORT", 7860))
    print(f"\n{'='*60}")
    print(f"🚀  ASKIFY RUNNING")
    print(f"{'='*60}")
    print(f"📡 Backend API:     http://127.0.0.1:{port}")
    print(f"🌐 Frontend (dev):  http://127.0.0.1:5174  (Vite + HMR)")
    print(f"🌐 Frontend (prod): http://127.0.0.1:{port}     (Flask static)")
    print(f"💚 Health Check:    http://127.0.0.1:{port}/api/health")
    print(f"{'='*60}\n")
    app.run(host="0.0.0.0", port=port, debug=True, use_reloader=False)
