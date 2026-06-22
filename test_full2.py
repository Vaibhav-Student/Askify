import sys
sys.path.insert(0, 'C:/Users/Lenovo/Desktop/Project/AI/Askify-main')
from rag_engine import RAGEngine
engine = RAGEngine(None, provider='nvidia', model_name='google/Gemma-4-3db-it', api_key='')
print("Engine created")
for chunk in engine.stream_generate_response('hello'):
    print("Chunk:", repr(chunk))