import os
os.chdir('C:/Users/Lenovo/Desktop/Project/AI/Askify-main')
print("Step 1")
import rag_engine
print("Step 2")
engine = rag_engine.RAGEngine(None, provider='nvidia', model_name='google/Gemma-4-3db-it', api_key='')
print("Step 3 - Engine created")
for chunk in engine.stream_generate_response('hello'):
    print("Chunk:", repr(chunk)[:100])