"""
rag_engine.py — NVIDIA-Exclusive RAG Engine

⚠️  MODEL LOCK — DO NOT MODIFY
    CHAT_MODEL  : minimaxai/minimax-m3   (Chat feature)
    STUDY_MODEL : google/gemma-4-31b-it  (Study Hub feature)
"""

import os
import json
import time
import queue
import threading
import warnings
import re

from dotenv import load_dotenv
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain.chains import create_history_aware_retriever, create_retrieval_chain
from langchain.chains.combine_documents import create_stuff_documents_chain

warnings.filterwarnings("ignore", category=UserWarning, module="langchain_nvidia_ai_endpoints")
load_dotenv()

from config import NVIDIA_API_KEY, CHAT_MODEL, STUDY_MODEL, ALLOWED_MODELS, TEMPERATURE, MAX_TOKENS
from sanitizer import sanitize_text, sanitize_document

SYSTEM_PROMPT = """You are Askify, a concise academic assistant. Answer only what is asked — no fluff, no pleasantries.

RULES:
1. Answer exactly what was asked.
2. If academic documents are provided, blend document facts with your general knowledge.
3. If no documents, answer from general knowledge immediately.
4. Use **Bold Headings**, bullets, numbered lists. No markdown headers (#).
5. Respond in English only.

FORMAT:
**Direct Answer** — 1-2 sentences
**Detailed Explanation** — bullet points with specifics
**Key Takeaways** — brief summary"""


class _NvidiaLLM:
    """Bulletproof NVIDIA LLM wrapper with multi-tier fallback."""

    _MODELS_TO_TRY = None  # Set at class level after config loads

    def __init__(self, model_name: str):
        self.model_name = model_name if model_name in ALLOWED_MODELS else CHAT_MODEL

    @staticmethod
    def _build_messages(messages):
        return [
            {
                "role": "system" if isinstance(m, SystemMessage)
                    else "assistant" if isinstance(m, AIMessage) else "user",
                "content": sanitize_text(str(m.content)),
            }
            for m in messages
        ]

    @staticmethod
    def _post_nvidia(model, payload, stream=False, timeout_read=60.0):
        import requests
        s = requests.Session()
        s.trust_env = False
        resp = s.post(
            "https://integrate.api.nvidia.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {NVIDIA_API_KEY}",
                "Content-Type": "application/json",
                "Accept": "text/event-stream" if stream else "application/json",
            },
            json=payload,
            timeout=(10.0, timeout_read),
            stream=stream,
        )
        resp.raise_for_status()
        return resp

    def _non_stream_call(self, model, messages):
        payload = {
            "model": model,
            "messages": self._build_messages(messages),
            "temperature": TEMPERATURE,
            "max_tokens": min(MAX_TOKENS, 2048),
            "top_p": 0.9,
            "stream": False,
        }
        try:
            resp = self._post_nvidia(model, payload, stream=False, timeout_read=60.0)
            data = resp.json()
            content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            if not content:
                raise RuntimeError(f"Empty content from {model}")
            return content
        except Exception as e:
            err_str = str(e)
            if "Cannot read" in err_str or "image" in err_str.lower():
                raise RuntimeError("text contains image-like content not supported by this model")
            raise

    def _stream_call(self, model, messages):
        payload = {
            "model": model,
            "messages": self._build_messages(messages),
            "temperature": TEMPERATURE,
            "max_tokens": min(MAX_TOKENS, 2048),
            "top_p": 0.9,
            "stream": True,
        }
        try:
            resp = self._post_nvidia(model, payload, stream=True, timeout_read=120.0)
            for line in resp.iter_lines(decode_unicode=True):
                if not line or not line.startswith("data: "):
                    continue
                raw = line[6:].strip()
                if raw == "[DONE]":
                    break
                try:
                    chunk = json.loads(raw)
                    if "error" in chunk:
                        raise RuntimeError(chunk["error"])
                    token = chunk.get("choices", [{}])[0].get("delta", {}).get("content")
                    if token:
                        yield token
                except (json.JSONDecodeError, KeyError, IndexError):
                    continue
        except Exception as e:
            err_str = str(e)
            if "Cannot read" in err_str or "image" in err_str.lower():
                raise RuntimeError("text contains image-like content not supported by this model")
            raise

    def _get_model_chain(self):
        """Return ordered list of models to try. No fallback — model is locked."""
        return [self.model_name]

    def invoke(self, messages):
        last_error = None
        for model in self._get_model_chain():
            try:
                content = self._non_stream_call(model, messages)
                return AIMessage(content=content)
            except Exception as e:
                last_error = e
                continue
        if last_error:
            raise last_error
        raise RuntimeError("LLM invoke failed for all models in the chain")

    def stream(self, messages):
        """Try streaming first (fast), fall back to non-streaming invoke."""
        try:
            yield from self._stream_call(self.model_name, messages)
            return
        except Exception as e:
            print(f"[LLM Stream failed: {e}] Trying non-stream invoke...", flush=True)
        # Fallback: get full response at once, yield in chunks
        try:
            content = self._non_stream_call(self.model_name, messages)
            chunk_size = 15
            for i in range(0, len(content), chunk_size):
                yield content[i:i + chunk_size]
        except Exception as e2:
            raise RuntimeError(f"LLM failed (both stream and invoke errored): {e2}")

def _create_nvidia_llm(model_name: str):
    """Create NVIDIA LLM wrapper."""
    if model_name not in ALLOWED_MODELS:
        model_name = CHAT_MODEL
    return _NvidiaLLM(model_name)


class RAGEngine:
    """NVIDIA-only RAG engine with streaming."""

    def __init__(self, vector_store, model_name=None):
        self._vector_store = vector_store
        self.model_name = model_name or CHAT_MODEL
        self.llm = _create_nvidia_llm(self.model_name)
        self.history = []
        self._chain = None
        self._qa_chain = None
        self.cache_file = "query_cache.json"
        self._load_cache()

    @property
    def vector_store(self):
        return self._vector_store

    @vector_store.setter
    def vector_store(self, value):
        self._vector_store = value
        self._chain = None
        self._qa_chain = None

    def _load_cache(self):
        self.cache = {}
        if os.path.exists(self.cache_file):
            try:
                with open(self.cache_file, "r", encoding="utf-8") as f:
                    raw_cache = json.load(f)
                # Clean up any bad/empty/fallback entries from the loaded cache
                for q, v in raw_cache.items():
                    ans = v.get("answer", "")
                    if ans and not (
                        "brief connection delay" in ans.lower() or
                        "upload study documents" in ans.lower() or
                        "ready to help" in ans.lower() or
                        "temporary issue connecting" in ans.lower() or
                        "image-like content" in ans.lower() or
                        "Connection Issue" in ans
                    ):
                        self.cache[q] = v
            except Exception:
                pass

    def _save_cache(self):
        try:
            with open(self.cache_file, "w", encoding="utf-8") as f:
                json.dump(self.cache, f, ensure_ascii=False, indent=2)
        except Exception:
            pass

    def _get_retriever(self):
        if self._vector_store is None:
            return None
        return self._vector_store.as_retriever(search_kwargs={"k": 5})

    def _get_qa_chain(self):
        if self._qa_chain is not None:
            return self._qa_chain
        if self.llm is None:
            return None
        prompt = ChatPromptTemplate.from_messages([
            ("system", SYSTEM_PROMPT + "\n\n## Retrieved Academic Context\n{context}"),
            MessagesPlaceholder("chat_history"),
            ("human", "{input}"),
        ])
        self._qa_chain = create_stuff_documents_chain(self.llm, prompt)
        return self._qa_chain

    def detect_intent(self, query: str) -> str:
        q = query.lower()
        if any(kw in q for kw in ['difference', 'compare', 'vs', 'versus']):
            return 'comparison'
        if any(kw in q for kw in ['roadmap', 'study plan', 'schedule', 'prepare']):
            return 'roadmap'
        if any(kw in q for kw in ['solve', 'answer', 'find', 'calculate', 'compute']):
            return 'question_solving'
        if any(kw in q for kw in ['summarize', 'summary', 'brief', 'short notes']):
            return 'summary'
        return 'topic_explanation'

    def stream_generate_response(self, query: str, prewarmed_docs=None):
        normalized_query = query.strip().lower()

        # Cache check
        if normalized_query in self.cache:
            cached = self.cache[normalized_query]
            yield f"data: {json.dumps({'token': '**Answer:**  \n' + cached['answer']})}\n\n"
            yield f"data: {json.dumps({'intent': cached.get('intent', 'topic_explanation'), 'sources': cached.get('sources', []), 'done': True})}\n\n"
            self.history.append(HumanMessage(content=query))
            self.history.append(AIMessage(content=cached['answer']))
            return

        # Start with plain Answer marker (no emoji to avoid encoding issues)
        yield f"data: {json.dumps({'token': '**Answer:**  \n'})}\n\n"

        if not self.llm:
            yield f"data: {json.dumps({'token': 'I am ready to help. Please upload study documents first using the sidebar.'})}\n\n"
            yield f"data: {json.dumps({'intent': 'topic_explanation', 'sources': [], 'done': True})}\n\n"
            return

        try:
            full_answer = ""
            sources = []
            seen_sources = set()

            from app_api import GLOBAL_STATE
            documents = GLOBAL_STATE.get("documents", [])
        except ImportError:
            documents = []

        # Build context only if documents are actively uploaded
        context_docs = None
        if documents:
            if prewarmed_docs:
                context_docs = prewarmed_docs
            elif self._vector_store is not None:
                try:
                    retriever = self._get_retriever()
                    context_docs = retriever.invoke(query) if retriever else []
                except Exception:
                    context_docs = []

        context_text = ""
        if context_docs:
            context_text = "\n\n".join(doc.page_content[:1400] for doc in context_docs[:5])

        system_content = SYSTEM_PROMPT
        if context_text:
            system_content += f"\n\nUse this retrieved context first:\n{context_text}"

        messages = [SystemMessage(content=system_content)]
        if self.history:
            messages.extend(self.history[-6:])
        messages.append(HumanMessage(content=query))

        # Stream from NVIDIA with automatic fallback
        try:
            for token_text in self.llm.stream(messages):
                if token_text:
                    full_answer += token_text
                    yield f"data: {json.dumps({'token': token_text})}\n\n"
        except Exception as e:
            # Print exception for debug logs
            print(f"[RAG Exception] {type(e).__name__}: {e}", flush=True)
            import traceback
            traceback.print_exc()
            if context_text:
                local_answer = f"**Response based on your documents:**\n\n{context_text[:2000]}"
                full_answer = local_answer
                yield f"data: {json.dumps({'token': local_answer})}\n\n"
            else:
                fallback_msg = (
                    f"⚠️ **Connection Issue**\n\n"
                    f"`{type(e).__name__}: {str(e)[:200]}`\n\n"
                    f"📌 Wait a moment and retry\n"
                    f"📌 Check your connection"
                )
                full_answer = fallback_msg
                yield f"data: {json.dumps({'token': fallback_msg})}\n\n"

        # Sources
        if context_docs:
            for doc in context_docs:
                src = doc.metadata.get("source", "Unknown")
                page = doc.metadata.get("page", "N/A")
                key = f"{src}_{page}"
                if key not in seen_sources:
                    seen_sources.add(key)
                    try:
                        sources.append({"name": src, "page": int(page)})
                    except ValueError:
                        sources.append({"name": src, "page": page})

        clean_answer = full_answer.strip()
        intent = self.detect_intent(query)

        # Check if the answer is empty or is a fallback/delay message
        is_fallback = (
            not clean_answer or
            "brief connection delay" in clean_answer.lower() or
            "upload study documents" in clean_answer.lower() or
            "ready to help" in clean_answer.lower() or
            "temporary issue connecting" in clean_answer.lower() or
            "image-like content" in clean_answer.lower() or
            "Connection Issue" in clean_answer
        )

        if not is_fallback:
            self.cache[normalized_query] = {"answer": clean_answer, "intent": intent, "sources": sources}
            self._save_cache()

        self.history.append(HumanMessage(content=query))
        self.history.append(AIMessage(content=clean_answer))
        if len(self.history) > 12:
            self.history = self.history[-12:]

        yield f"data: {json.dumps({'intent': intent, 'sources': sources, 'done': True})}\n\n"

    def clear_history(self):
        self.history = []
        self._chain = None
