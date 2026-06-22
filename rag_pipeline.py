from langchain_nvidia_ai_endpoints import ChatNVIDIA
from langchain_core.prompts import ChatPromptTemplate
from config import NVIDIA_API_KEY, ALLOWED_MODELS


def generate_answer(query, retrieved_docs, nvidia_api_key=None):

    context = "\n\n".join([doc.page_content for doc in retrieved_docs])

    prompt = ChatPromptTemplate.from_template("""
You are an academic AI assistant.

Use the provided context to answer clearly in structured format.

Context:
{context}

Question:
{question}

Answer format:
1. Definition
2. Explanation
3. Example
4. Key Points
5. Conclusion
""")

    key_to_use = nvidia_api_key if nvidia_api_key else NVIDIA_API_KEY
    llm = ChatNVIDIA(
        api_key=key_to_use,
        model=ALLOWED_MODELS[0],
        temperature=0.3
    )

    chain = prompt | llm

    response = chain.invoke({
        "context": context,
        "question": query
    })

    return response.content
