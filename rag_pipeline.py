from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate


def generate_answer(query, retrieved_docs, groq_api_key):

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

    llm = ChatGroq(
        groq_api_key=groq_api_key,
        model_name="llama-3.1-8b-instant",  # ✅ Updated model
        temperature=0.3
    )

    chain = prompt | llm

    response = chain.invoke({
        "context": context,
        "question": query
    })

    return response.content