"""
RAG Engine Module
Multi-provider LangChain RAG with streaming support.
Supports: Groq, OpenAI, Gemini, Anthropic, Mistral, DeepSeek.
"""

import os
import json
from dotenv import load_dotenv

from langchain.chains import create_history_aware_retriever, create_retrieval_chain
from langchain.chains.combine_documents import create_stuff_documents_chain
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder


load_dotenv()

SYSTEM_PROMPT = """You are a high-speed, low-latency AI API backend. Keep response strictly under 80 tokens. Output minified JSON only. Do NOT use markdown code blocks."""


def _create_llm(provider: str, model_name: str, api_key: str):
    """Factory function to create the correct LangChain LLM based on provider."""
    common_kwargs = {
        "temperature": 0.3,
        "max_tokens": 1024,
        "streaming": True,
        "timeout": 30.0,
    }

    if provider == "groq":
        from langchain_groq import ChatGroq
        return ChatGroq(api_key=api_key, model_name=model_name, **common_kwargs)

    elif provider == "openai":
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(api_key=api_key, model=model_name, **common_kwargs)

    elif provider == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(
            google_api_key=api_key,
            model=model_name,
            temperature=common_kwargs["temperature"],
            max_output_tokens=common_kwargs["max_tokens"],
            streaming=True,
        )

    elif provider == "anthropic":
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(
            anthropic_api_key=api_key,
            model_name=model_name,
            temperature=common_kwargs["temperature"],
            max_tokens=common_kwargs["max_tokens"],
            streaming=True,
        )

    elif provider == "mistral":
        from langchain_mistralai import ChatMistralAI
        return ChatMistralAI(
            api_key=api_key,
            model=model_name,
            temperature=common_kwargs["temperature"],
            max_tokens=common_kwargs["max_tokens"],
            streaming=True,
        )

    elif provider == "deepseek":
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            api_key=api_key,
            model=model_name,
            base_url="https://api.deepseek.com/v1",
            **common_kwargs,
        )

    elif provider == "openrouter":
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            api_key=api_key,
            model=model_name,
            base_url="https://openrouter.ai/api/v1",
            **common_kwargs,
        )

    elif provider == "perplexity":
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            api_key=api_key,
            model=model_name,
            base_url="https://api.perplexity.ai",
            **common_kwargs,
        )

    elif provider == "together":
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            api_key=api_key,
            model=model_name,
            base_url="https://api.together.xyz/v1",
            **common_kwargs,
        )

    elif provider == "xai":
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            api_key=api_key,
            model=model_name,
            base_url="https://api.x.ai/v1",
            **common_kwargs,
        )

    elif provider == "nvidia":
        from langchain_openai import ChatOpenAI
        
        extra_body = None
        if "gemma" in model_name:
            key_to_use = api_key if api_key else "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"
            if model_name == "google/gemma-4-31b-it":
                extra_body = {
                    "chat_template_kwargs": {"enable_thinking": False}
                }
        elif model_name == "moonshotai/kimi-k2.6":
            key_to_use = api_key if api_key else "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"
        else:
            key_to_use = api_key if api_key else "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"
        
        return ChatOpenAI(
            api_key=key_to_use,
            model=model_name,
            base_url="https://integrate.api.nvidia.com/v1",
            extra_body=extra_body,
            **common_kwargs,
        )

    else:
        raise ValueError(f"Unsupported AI provider: {provider}")


def select_model_for_query(query: str) -> str:
    """
    Always return google/gemma-3n-e4b-it.
    """
    return "google/gemma-3n-e4b-it"


class RAGEngine:
    """
    Multi-provider LangChain RAG engine with streaming.
    """

    def __init__(self, vector_store, provider="nvidia", model_name=None, api_key=None):
        self.vector_store = vector_store
        self.llm = None
        self.provider = provider
        self.model_name = model_name or "google/gemma-3n-e4b-it"
        self.api_key = api_key
        self.history = []
        self._chain = None

        self.cache_file = "query_cache.json"
        self._load_cache()

        if api_key or provider == "nvidia":
            self._init_llm(api_key)

    def _load_cache(self):
        self.cache = {}
        if os.path.exists(self.cache_file):
            try:
                with open(self.cache_file, "r", encoding="utf-8") as f:
                    self.cache = json.load(f)
            except Exception:
                pass

    def _save_cache(self):
        try:
            with open(self.cache_file, "w", encoding="utf-8") as f:
                json.dump(self.cache, f, ensure_ascii=False, indent=2)
        except Exception:
            pass

    def _init_llm(self, api_key: str):
        """Initialize the LLM for the configured provider."""
        try:
            self.llm = _create_llm(self.provider, self.model_name, api_key)
            self._chain = None
        except Exception as e:
            print(f"[RAG Engine] Failed to initialize LLM for {self.provider}/{self.model_name}: {e}")
            self.llm = None

    def _get_qa_prompt(self):
        qa_system_prompt = (
            "You are a Premium AI Academic Assistant. Your task is to provide expert-level answers using retrieved context.\n\n"
            "CRITICAL PRIORITY: You MUST analyze the **Retrieved Academic Context** provided below first. If it contains relevant information, "
            "it takes absolute precedence. Use your internal knowledge only to supplement or if the context is entirely irrelevant.\n\n"
            f"{SYSTEM_PROMPT}\n\n"
            "## Retrieved Academic Context\n"
            "{context}"
        )
        return ChatPromptTemplate.from_messages([
            ("system", qa_system_prompt),
            MessagesPlaceholder("chat_history"),
            ("human", "{input}"),
        ])

    def _get_chain(self):
        if self._chain is not None:
            return self._chain

        if self.vector_store is None or self.llm is None:
            return None

        retriever = self.vector_store.as_retriever(top_k=5)

        contextualize_q_system_prompt = (
            "Given a chat history and the latest user question "
            "which might reference context in the chat history, "
            "formulate a standalone question which can be understood "
            "without the chat history. Do NOT answer the question, "
            "just reformulate it if needed and otherwise return it as is."
        )
        contextualize_q_prompt = ChatPromptTemplate.from_messages([
            ("system", contextualize_q_system_prompt),
            MessagesPlaceholder("chat_history"),
            ("human", "{input}"),
        ])
        history_aware_retriever = create_history_aware_retriever(
            self.llm, retriever, contextualize_q_prompt
        )

        qa_prompt = self._get_qa_prompt()
        question_answer_chain = create_stuff_documents_chain(self.llm, qa_prompt)
        self._chain = create_retrieval_chain(history_aware_retriever, question_answer_chain)
        return self._chain

    def set_api_key(self, api_key: str):
        if api_key or self.provider == "nvidia":
            self._init_llm(api_key)
        else:
            self.llm = None
            self._chain = None

    def has_api_key(self) -> bool:
        return self.llm is not None

    def detect_intent(self, query: str) -> str:
        query_lower = query.lower()
        if any(kw in query_lower for kw in ['difference', 'compare', 'vs', 'versus', 'distinguish', 'differentiate']):
            return 'comparison'
        elif any(kw in query_lower for kw in ['roadmap', 'study plan', 'schedule', 'prepare', 'preparation', 'week-wise', 'plan for']):
            return 'roadmap'
        elif any(kw in query_lower for kw in ['solve', 'answer', 'find', 'calculate', 'compute', 'derive', 'prove', 'write a program', 'write code']):
            return 'question_solving'
        elif any(kw in query_lower for kw in ['summarize', 'summary', 'brief', 'short notes', 'revision']):
            return 'summary'
        return 'topic_explanation'

    def stream_generate_response(self, query: str, prewarmed_docs=None):
        # Select model dynamically based on query complexity
        selected_model = select_model_for_query(query)
        if selected_model != self.model_name:
            self.model_name = selected_model
            self._init_llm(api_key=self.api_key)

        # Instant visual feedback that request processing has started
        yield f"data: {json.dumps({'token': '⚡ *Agent connecting...*  \n'})}\n\n"

        if self.model_name == "moonshotai/kimi-k2.6":
            yield f"data: {json.dumps({'token': '⚡ *Routing complex query to Kimi K2.6...*  \n'})}\n\n"
        else:
            yield f"data: {json.dumps({'token': '⚡ *Routing query to Study AI...*  \n'})}\n\n"

        # Check query cache
        normalized_query = query.strip().lower()
        if normalized_query in self.cache:
            cached_data = self.cache[normalized_query]
            yield f"data: {json.dumps({'token': '⚡ *Retrieved from cache (Instant)*  \n\n' + cached_data['answer']})}\n\n"
            yield f"data: {json.dumps({'intent': cached_data.get('intent', 'topic_explanation'), 'sources': cached_data.get('sources', []), 'done': True})}\n\n"
            
            # Update memory
            self.history.append(HumanMessage(content=query))
            self.history.append(AIMessage(content=cached_data['answer']))
            return

        if not self.llm:
            yield f"data: {json.dumps({'error': f'LLM not initialized. Check your API key for {self.provider}.'})}\n\n"
            return

        try:
            from app_api import GLOBAL_STATE
            documents = GLOBAL_STATE.get("documents", [])
        except ImportError:
            documents = []

        # Determine if we can run the fast path (RAG or direct LLM)
        query_lower = query.lower()
        is_doc_cmd = any(kw in query_lower for kw in ["delete", "remove", "list document", "list file", "uploaded document", "uploaded file"])

        if not is_doc_cmd:
            # ── Fast Single-Step Generation Path ──
            yield f"data: {json.dumps({'token': '🤖 **Step 1 Thinking...**  \n'})}\n\n"
            
            try:
                full_answer = ""
                sources = []
                seen_sources = set()
                
                chain = self._get_chain()
                if prewarmed_docs:
                    # Run the stuff documents chain directly using the prewarmed context documents
                    qa_prompt = self._get_qa_prompt()
                    question_answer_chain = create_stuff_documents_chain(self.llm, qa_prompt)
                    
                    stream = question_answer_chain.stream({
                        "input": query,
                        "chat_history": self.history,
                        "context": prewarmed_docs
                    })
                    yield f"data: {json.dumps({'token': '📚 **Answer:**  \n'})}\n\n"
                    for chunk in stream:
                        token = chunk
                        full_answer += token
                        yield f"data: {json.dumps({'token': token})}\n\n"
                    
                    for doc in prewarmed_docs:
                        src = doc.metadata.get("source", "Unknown")
                        page = doc.metadata.get("page", "N/A")
                        key = f"{src}_{page}"
                        if key not in seen_sources:
                            seen_sources.add(key)
                            try:
                                sources.append({"name": src, "page": int(page)})
                            except ValueError:
                                sources.append({"name": src, "page": page})
                elif chain:
                    # RAG retrieval chain
                    stream = chain.stream({"input": query, "chat_history": self.history})
                    yield f"data: {json.dumps({'token': '📚 **Answer:**  \n'})}\n\n"
                    for chunk in stream:
                        if "answer" in chunk:
                            token = chunk["answer"]
                            full_answer += token
                            yield f"data: {json.dumps({'token': token})}\n\n"
                        if "context" in chunk:
                            for doc in chunk["context"]:
                                src = doc.metadata.get("source", "Unknown")
                                page = doc.metadata.get("page", "N/A")
                                key = f"{src}_{page}"
                                if key not in seen_sources:
                                    seen_sources.add(key)
                                    try:
                                        sources.append({"name": src, "page": int(page)})
                                    except ValueError:
                                        sources.append({"name": src, "page": page})
                    
                    # Fallback source extraction from retriever if stream chunks did not contain context
                    if not sources:
                        try:
                            retriever = self.vector_store.as_retriever(top_k=5)
                            docs = retriever.invoke(query)
                            for doc in docs:
                                src = doc.metadata.get("source", "Unknown")
                                page = doc.metadata.get("page", "N/A")
                                key = f"{src}_{page}"
                                if key not in seen_sources:
                                    seen_sources.add(key)
                                    try:
                                        sources.append({"name": src, "page": int(page)})
                                    except ValueError:
                                        sources.append({"name": src, "page": page})
                        except Exception:
                            pass
                else:
                    # Direct LLM stream (no vector store/documents uploaded)
                    messages = [SystemMessage(content=SYSTEM_PROMPT)]
                    if self.history:
                        messages.extend(self.history[-6:])
                    messages.append(HumanMessage(content=query))
                    
                    stream = self.llm.stream(messages)
                    yield f"data: {json.dumps({'token': '📚 **Answer:**  \n'})}\n\n"
                    for chunk in stream:
                        token = chunk.content
                        full_answer += token
                        yield f"data: {json.dumps({'token': token})}\n\n"

                clean_answer = full_answer.strip()
                intent = self.detect_intent(query)
                
                self.cache[normalized_query] = {
                    "answer": clean_answer,
                    "intent": intent,
                    "sources": sources
                }
                self._save_cache()

                self.history.append(HumanMessage(content=query))
                self.history.append(AIMessage(content=clean_answer))
                if len(self.history) > 12:
                    self.history = self.history[-12:]
                
                yield f"data: {json.dumps({'intent': intent, 'sources': sources, 'done': True})}\n\n"
                return
            except Exception as e:
                print(f"[RAG Engine] Fast path failed: {e}. Falling back to ReActAgent.")

        # ── Fallback: Goal-Driven ReActAgent Loop ──
        from agent import ReActAgent
        agent = ReActAgent(
            llm=self.llm,
            vector_store=self.vector_store,
            documents=documents
        )

        try:
            full_answer = ""
            for chunk_str in agent.stream_run(query, chat_history=self.history):
                yield chunk_str
                if chunk_str.startswith("data: "):
                    try:
                        data = json.loads(chunk_str[6:].strip())
                        if "token" in data:
                            full_answer += data["token"]
                    except Exception:
                        pass

            import re
            clean_answer = full_answer
            if '📚 **Answer:**' in clean_answer:
                clean_answer = clean_answer.split('📚 **Answer:**', 1)[1]
            
            clean_answer = re.sub(r"⚡\s*\*Agent connecting\.+\*\s*", "", clean_answer)
            clean_answer = re.sub(r"⚡\s*\*Routing.*?\*\s*", "", clean_answer)
            clean_answer = re.sub(r"⚡\s*\*Retrieved from cache \(Instant\)\*\s*", "", clean_answer)
            clean_answer = re.sub(r"🤖\s*\*+Step \d+ Thinking\.+\*\*+\s*", "", clean_answer)
            clean_answer = re.sub(r"⚙️\s*\*+Executing Tool:\*+.*?(?:\n|$)", "", clean_answer)
            clean_answer = re.sub(r"📝\s*\*+Observation:\*+.*?(?=(?:🤖\s*\*+Step|📚\s*\*+Answer|\n\n|$))", "", clean_answer, flags=re.DOTALL)
            clean_answer = clean_answer.strip()

            sources = agent.extract_sources(agent.run_history)
            intent = self.detect_intent(query)
            
            self.cache[normalized_query] = {
                "answer": clean_answer,
                "intent": intent,
                "sources": sources
            }
            self._save_cache()

            self.history.append(HumanMessage(content=query))
            self.history.append(AIMessage(content=clean_answer))
            if len(self.history) > 12:
                self.history = self.history[-12:]

        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    def clear_history(self):
        self.history = []
        self._chain = None

