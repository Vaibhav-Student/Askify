"""
agent.py — Goal-Driven ReAct (Reason + Act) Autonomous Agent

This module implements:
1. Typed Agent Tools (search_knowledge_base, get_document_list, delete_document)
2. A ReAct (Reason + Act) loop using structured format parsing
3. Memory management (short-term run context and conversation history)
4. Source extraction and streaming support
"""

import re
import json
import logging
from typing import Any, Dict, List, Generator
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

logger = logging.getLogger(__name__)

# Regex to detect actions: Action: tool_name(argument)
ACTION_REGEX = re.compile(r"Action:\s*(\w+)\((.*)\)", re.IGNORECASE)

# ── Agent System Prompt ──────────────────────────────────────────────────────

AGENT_SYSTEM_PROMPT = """You are a Premium AI Academic Assistant. Goal: Solve academic queries with accuracy and SPEED.
To meet time budgets, execute at most 1 tool call and output the Answer immediately in the next step.

Tools:
1. `search_knowledge_base(query)`: Searches documents. Input: query (str). Output: relevant text.
2. `get_document_list()`: Lists uploaded documents. Input: none.
3. `delete_document(filename)`: Deletes document. Input: filename (str).

ReAct Format:
Thought: <reasoning>
Action: <tool_name>(<arg>)
OR:
Thought: <reasoning>
Answer: <final structured markdown response. Never use "#"/"##" headers; use **bold text** for headings. Break paragraphs with blank lines.>
"""

# ── Tool Layer Definitions ───────────────────────────────────────────────────

class AgentTool:
    """Represents a typed, executable tool for the agent."""
    def __init__(
        self,
        name: str,
        description: str,
        func: Any,
        input_schema: Dict[str, str],
        output_schema: str,
        has_side_effects: bool = False
    ):
        self.name = name
        self.description = description
        self.func = func
        self.input_schema = input_schema
        self.output_schema = output_schema
        self.has_side_effects = has_side_effects

    def execute(self, *args, **kwargs) -> str:
        try:
            return self.func(*args, **kwargs)
        except Exception as e:
            logger.error(f"Error executing tool {self.name}: {e}", exc_info=True)
            return f"Error executing tool {self.name}: {str(e)}"


def tool_search_knowledge_base(query: str, vector_store) -> str:
    """Tool: Searches FAISS vector store and returns matching documents."""
    if vector_store is None:
        return "Observation: No documents uploaded. The knowledge base is empty. Please upload documents first."
    
    try:
        # We search with top_k = 4
        from vector_store import get_retriever
        retriever = get_retriever(vector_store)
        docs = retriever.invoke(query)
        if not docs:
            return "Observation: No matching academic chunks found for this query."
        
        formatted_chunks = []
        for i, doc in enumerate(docs):
            src = doc.metadata.get("source", "Unknown")
            page = doc.metadata.get("page", "N/A")
            chunk_idx = doc.metadata.get("chunk_index", "N/A")
            formatted_chunks.append(
                f"[Source: {src}, Page: {page}, Chunk: {chunk_idx}]\n{doc.page_content}"
            )
        return "\n\n---\n\n".join(formatted_chunks)
    except Exception as e:
        return f"Observation Error: Failed to perform search: {str(e)}"


def tool_get_document_list(documents: List[Dict[str, Any]]) -> str:
    """Tool: Returns a formatted list of all documents."""
    if not documents:
        return "Observation: No documents are currently uploaded."
    
    lines = ["Here are the uploaded documents:"]
    for doc in documents:
        name = doc.get("name", "Unknown")
        chunks = doc.get("chunks", 0)
        size_kb = doc.get("size", 0) // 1024
        lines.append(f"- 📄 {name} ({size_kb} KB, {chunks} chunks)")
    return "\n".join(lines)


def tool_delete_document(filename: str, documents: List[Dict[str, Any]]) -> str:
    """Tool: Deletes document from session state and triggers vector store rebuild."""
    found = False
    for i, doc in enumerate(list(documents)):
        if doc.get("name") == filename:
            documents.pop(i)
            found = True
            break
            
    if found:
        # Trigger rebuild
        try:
            from app_api import rebuild_vector_store
            import threading
            threading.Thread(target=rebuild_vector_store, daemon=True).start()
            return f"Observation: Successfully deleted document '{filename}'. Vector store rebuild initiated in the background."
        except ImportError:
            return f"Observation: Deleted document '{filename}' from memory, but failed to trigger background rebuild."
    else:
        return f"Observation Error: Document '{filename}' was not found. Available files are: " + \
            ", ".join(d.get("name", "") for d in documents)


# ── ReAct Agent Loop ─────────────────────────────────────────────────────────

class ReActAgent:
    """
    Autonomous goal-driven agent implementing the ReAct loop.
    Interacts with the student and executes tools iteratively.
    """
    def __init__(
        self,
        llm: Any,
        vector_store: Any,
        documents: List[Dict[str, Any]],
        max_steps: int = 2
    ):
        self.llm = llm
        self.vector_store = vector_store
        self.documents = documents
        self.max_steps = max_steps
        
        # Register tools
        self.tools = {
            "search_knowledge_base": AgentTool(
                name="search_knowledge_base",
                description="Search the uploaded documents for semantic matching context.",
                func=lambda q: tool_search_knowledge_base(q, self.vector_store),
                input_schema={"query": "str"},
                output_schema="str",
                has_side_effects=False
            ),
            "get_document_list": AgentTool(
                name="get_document_list",
                description="List all files currently indexed in the academic assistant.",
                func=lambda: tool_get_document_list(self.documents),
                input_schema={},
                output_schema="str",
                has_side_effects=False
            ),
            "delete_document": AgentTool(
                name="delete_document",
                description="Delete a document and trigger vector store rebuild.",
                func=lambda f: tool_delete_document(f, self.documents),
                input_schema={"filename": "str"},
                output_schema="str",
                has_side_effects=True
            )
        }

    def detect_intent(self, query: str) -> str:
        """Determines the user intent category."""
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

    def extract_sources(self, run_history: List[Dict[str, str]]) -> List[Dict[str, Any]]:
        """Extracts source documents from tool observations in the run history."""
        sources = []
        seen = set()
        for step in run_history:
            obs = step.get("observation", "")
            matches = re.findall(r"\[Source:\s*([^,\]]+),\s*Page:\s*([^,\]]+)", obs)
            for name, page in matches:
                name = name.strip()
                page_val = page.strip()
                key = f"{name}_{page_val}"
                if key not in seen:
                    seen.add(key)
                    try:
                        page_int = int(page_val)
                        sources.append({"name": name, "page": page_int})
                    except ValueError:
                        sources.append({"name": name, "page": page_val})
        return sources

    def execute_tool(self, name: str, arg: str) -> str:
        """Executes a tool by name with parsed argument."""
        tool = self.tools.get(name)
        if not tool:
            return f"Observation Error: Tool '{name}' is not registered. Available tools: {', '.join(self.tools.keys())}"
        
        if tool.name == "get_document_list":
            return tool.execute()
        return tool.execute(arg)

    def _compile_prompt(self, query: str, run_history: List[Dict[str, str]], chat_history: List[Any] = None) -> List[Any]:
        """Compiles the ReAct prompt into messages for the LangChain LLM."""
        messages = [
            SystemMessage(content=AGENT_SYSTEM_PROMPT)
        ]
        
        # Add conversation context (short-term memory)
        if chat_history:
            # chat_history contains HumanMessage/AIMessage objects. We take the last 6 messages
            messages.extend(chat_history[-6:])

        # Add the human's current question
        messages.append(HumanMessage(content=f"Question: {query}"))

        # Add the agent's step-by-step reasoning history from this current execution run
        for step in run_history:
            messages.append(AIMessage(content=step["thought_action"]))
            messages.append(HumanMessage(content=step["observation"]))

        return messages

    def _compile_fallback_prompt(self, query: str, run_history: List[Dict[str, str]]) -> List[Any]:
        """Compiles a fallback prompt when the agent hits the max execution steps."""
        context = ""
        for i, step in enumerate(run_history):
            context += f"\n--- Step {i+1} ---\nObservation: {step.get('observation', '')}\n"

        prompt_str = (
            "You have reached your maximum thinking steps. Formulate your final answer to the user's question now "
            "based on the compiled context below. Follow all response format rules (Markdown, bold headings, etc.).\n\n"
            f"Question: {query}\n\n"
            f"Retrieved Context:\n{context}\n\n"
            "Final structured answer:"
        )
        return [
            SystemMessage(content=AGENT_SYSTEM_PROMPT),
            HumanMessage(content=prompt_str)
        ]

    def stream_run(self, query: str, chat_history: List[Any] = None) -> Generator[str, None, None]:
        """
        Executes the ReAct loop, yielding SSE (Server-Sent Events) tokens
        conforming to the existing API structure.
        """
        self.run_history = []
        run_history = self.run_history
        
        for step in range(self.max_steps):
            # Compile messages
            messages = self._compile_prompt(query, run_history, chat_history)
            
            # Yield thought indicator to the frontend
            yield f"data: {json.dumps({'token': f'🤖 **Step {step + 1} Thinking...**  \n'})}\n\n"
            
            current_step_text = ""
            is_answer_printed = False
            
            # Stream the LLM response for this step
            try:
                stream = self.llm.stream(messages)
                for chunk in stream:
                    token = chunk.content
                    current_step_text += token
                    
                    # Check if the LLM output transitioned to providing the final Answer
                    if "Answer:" in current_step_text and not is_answer_printed:
                        # Extract and output everything after "Answer:"
                        parts = current_step_text.split("Answer:", 1)
                        is_answer_printed = True
                        yield f"data: {json.dumps({'token': '📚 **Answer:**  \n' + parts[1]})}\n\n"
                    elif is_answer_printed:
                        yield f"data: {json.dumps({'token': token})}\n\n"
                    else:
                        # Stream the thinking output
                        yield f"data: {json.dumps({'token': token})}\n\n"
            except Exception as e:
                logger.error(f"Error streaming LLM response in step {step}: {e}", exc_info=True)
                yield f"data: {json.dumps({'error': f'LLM Generation Error: {str(e)}'})}\n\n"
                return

            # Check if a tool call was requested
            action_match = ACTION_REGEX.search(current_step_text)
            if action_match:
                tool_name = action_match.group(1).strip()
                tool_arg = action_match.group(2).strip()
                
                # Parse argument cleanly by removing quotes
                tool_arg_clean = tool_arg.strip(" '\"")
                
                yield f"data: {json.dumps({'token': f'\n\n⚙️ **Executing Tool:** `{tool_name}({tool_arg})`  \n'})}\n\n"
                
                # Execute the tool
                observation = self.execute_tool(tool_name, tool_arg_clean)
                
                # Format observation for display and agent history
                yield f"data: {json.dumps({'token': f'📝 **Observation:**  \n{observation[:400]}... [Truncated for preview]  \n\n'})}\n\n"
                
                run_history.append({
                    "thought_action": current_step_text,
                    "observation": observation
                })
            else:
                # No action matched. If the answer was printed or is present, we wrap up.
                if is_answer_printed or "Answer:" in current_step_text:
                    intent = self.detect_intent(query)
                    sources = self.extract_sources(run_history)
                    yield f"data: {json.dumps({'intent': intent, 'sources': sources, 'done': True})}\n\n"
                    return
                else:
                    # Fallback: if format protocol wasn't strictly followed but response is complete
                    intent = self.detect_intent(query)
                    sources = self.extract_sources(run_history)
                    yield f"data: {json.dumps({'intent': intent, 'sources': sources, 'done': True})}\n\n"
                    return
                    
        # If we exhausted max_steps
        yield f"data: {json.dumps({'token': '\n\n⚠️ *Agent reached maximum reasoning limit. Compiling final answers...*  \n'})}\n\n"
        
        fallback_prompt = self._compile_fallback_prompt(query, run_history)
        try:
            stream = self.llm.stream(fallback_prompt)
            for chunk in stream:
                yield f"data: {json.dumps({'token': chunk.content})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': f'LLM Fallback Generation Error: {str(e)}'})}\n\n"
            
        intent = self.detect_intent(query)
        sources = self.extract_sources(run_history)
        yield f"data: {json.dumps({'intent': intent, 'sources': sources, 'done': True})}\n\n"

    def run(self, query: str, chat_history: List[Any] = None) -> Dict[str, Any]:
        """Runs the ReAct loop synchronously and returns final output."""
        run_history = []
        for step in range(self.max_steps):
            messages = self._compile_prompt(query, run_history, chat_history)
            try:
                response = self.llm.invoke(messages)
                response_text = response.content
            except Exception as e:
                logger.error(f"Error invoking LLM in step {step}: {e}")
                break
                
            action_match = ACTION_REGEX.search(response_text)
            if action_match:
                tool_name = action_match.group(1).strip()
                tool_arg = action_match.group(2).strip().strip(" '\"")
                observation = self.execute_tool(tool_name, tool_arg)
                run_history.append({
                    "thought_action": response_text,
                    "observation": observation
                })
            else:
                if "Answer:" in response_text:
                    parts = response_text.split("Answer:", 1)
                    answer = parts[1].strip()
                else:
                    answer = response_text.strip()
                
                return {
                    "answer": answer,
                    "sources": self.extract_sources(run_history),
                    "intent": self.detect_intent(query)
                }
                
        # Fallback if max_steps reached
        fallback_prompt = self._compile_fallback_prompt(query, run_history)
        try:
            response = self.llm.invoke(fallback_prompt)
            answer = response.content
        except Exception:
            answer = "Sorry, I was unable to complete the query."
            
        return {
            "answer": answer,
            "sources": self.extract_sources(run_history),
            "intent": self.detect_intent(query)
        }
