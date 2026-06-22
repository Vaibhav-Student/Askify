import sys
print("Before import")
import langchain_nvidia_ai_endpoints
print("After import")
from langchain_nvidia_ai_endpoints import ChatNVIDIA
print("ChatNVIDIA imported")
key = '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'
print("Creating ChatNVIDIA...")
llm = ChatNVIDIA(model='google/Gemma-4-3db-it', api_key=key, temperature=0.3, max_tokens=1024)
print("Created:", llm)