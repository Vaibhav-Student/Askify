import unittest
from unittest.mock import MagicMock, patch
import json
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

from agent import (
    AgentTool,
    tool_search_knowledge_base,
    tool_get_document_list,
    tool_delete_document,
    ReActAgent
)

class TestAgentTools(unittest.TestCase):
    def test_agent_tool_execution(self):
        # A simple dummy tool
        dummy_func = lambda x: f"hello {x}"
        tool = AgentTool(
            name="dummy",
            description="A dummy test tool.",
            func=dummy_func,
            input_schema={"x": "str"},
            output_schema="str"
        )
        self.assertEqual(tool.name, "dummy")
        self.assertEqual(tool.execute("world"), "hello world")

    def test_search_knowledge_base_no_store(self):
        res = tool_search_knowledge_base("photosynthesis", None)
        self.assertIn("empty", res.lower())

    def test_search_knowledge_base_with_store(self):
        mock_vs = MagicMock()
        mock_retriever = MagicMock()
        mock_vs.as_retriever.return_value = mock_retriever
        
        # Mocking retrieved doc
        mock_doc = MagicMock()
        mock_doc.page_content = "Photosynthesis is the process..."
        mock_doc.metadata = {"source": "biology.pdf", "page": 4, "chunk_index": 12}
        mock_retriever.invoke.return_value = [mock_doc]

        with patch("vector_store.get_retriever", return_value=mock_retriever):
            res = tool_search_knowledge_base("photosynthesis", mock_vs)
            self.assertIn("biology.pdf", res)
            self.assertIn("Page: 4", res)
            self.assertIn("Photosynthesis is the process...", res)

    def test_get_document_list_empty(self):
        res = tool_get_document_list([])
        self.assertIn("no documents", res.lower())

    def test_get_document_list_with_items(self):
        docs = [
            {"name": "lecture1.pdf", "size": 102400, "chunks": 10},
            {"name": "syllabus.docx", "size": 20480, "chunks": 2}
        ]
        res = tool_get_document_list(docs)
        self.assertIn("lecture1.pdf", res)
        self.assertIn("100 KB", res)
        self.assertIn("10 chunks", res)

    def test_delete_document_not_found(self):
        docs = [{"name": "notes.pdf"}]
        res = tool_delete_document("other.pdf", docs)
        self.assertIn("not found", res.lower())

    def test_delete_document_success(self):
        docs = [{"name": "notes.pdf"}]
        with patch("app_api.rebuild_vector_store") as mock_rebuild:
            res = tool_delete_document("notes.pdf", docs)
            self.assertIn("deleted document", res.lower())
            self.assertEqual(len(docs), 0)


class TestReActAgent(unittest.TestCase):
    def setUp(self):
        self.mock_llm = MagicMock()
        self.mock_vs = MagicMock()
        self.docs = [{"name": "syllabus.pdf", "size": 2048, "chunks": 1}]
        self.agent = ReActAgent(self.mock_llm, self.mock_vs, self.docs)

    def test_detect_intent_comparison(self):
        self.assertEqual(self.agent.detect_intent("What is the difference between TCP and UDP?"), "comparison")

    def test_detect_intent_roadmap(self):
        self.assertEqual(self.agent.detect_intent("Give me a study plan for statistics"), "roadmap")

    def test_detect_intent_default(self):
        self.assertEqual(self.agent.detect_intent("Tell me about gravity"), "topic_explanation")

    def test_extract_sources(self):
        run_history = [
            {
                "thought_action": "Thought: search context",
                "observation": "[Source: physics_notes.pdf, Page: 12, Chunk: 0]\nGravity is an attractive force..."
            }
        ]
        sources = self.agent.extract_sources(run_history)
        self.assertEqual(len(sources), 1)
        self.assertEqual(sources[0]["name"], "physics_notes.pdf")
        self.assertEqual(sources[0]["page"], 12)

    def test_execute_tool_search(self):
        with patch.object(self.agent.tools["search_knowledge_base"], "execute", return_value="search result") as mock_exec:
            res = self.agent.execute_tool("search_knowledge_base", "query text")
            mock_exec.assert_called_once_with("query text")
            self.assertEqual(res, "search result")

    def test_execute_tool_invalid(self):
        res = self.agent.execute_tool("invalid_tool", "arg")
        self.assertIn("not registered", res)

if __name__ == '__main__':
    unittest.main()
