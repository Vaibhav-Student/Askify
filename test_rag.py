import os
import unittest
from unittest.mock import MagicMock
from rag_engine import RAGEngine

class TestRAGEngine(unittest.TestCase):
    def setUp(self):
        # Mock vector store
        self.mock_vector_store = MagicMock()
        self.engine = RAGEngine(self.mock_vector_store)

    def test_intent_detection_comparison(self):
        query = "What is the difference between A and B?"
        intent = self.engine.detect_intent(query)
        self.assertEqual(intent, 'comparison')

    def test_intent_detection_roadmap(self):
        query = "Create a study plan for calculus"
        intent = self.engine.detect_intent(query)
        self.assertEqual(intent, 'roadmap')

    def test_intent_detection_summary(self):
        query = "Summarize the chapter on thermodynamics"
        intent = self.engine.detect_intent(query)
        self.assertEqual(intent, 'summary')

    def test_intent_detection_explanation(self):
        query = "Explain quantum physics"
        intent = self.engine.detect_intent(query)
        self.assertEqual(intent, 'topic_explanation')

if __name__ == '__main__':
    unittest.main()
