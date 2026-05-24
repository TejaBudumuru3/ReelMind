"""Quick test for the RAG chain — run from apps/server/"""
import asyncio
from rag.retrieval_chain import stream_chat

async def main():
    session_id = "ae0326cb-449b-4b96-ab90-671bb01fb8e9"  # your test session
    question = "how much engagement did video A get?"

    print(f"Question: {question}\n")
    print("Response: ", end="", flush=True)

    async for token in stream_chat(question, session_id):
        if token:
            print(token, end="", flush=True)
    

if __name__ == "__main__":
    asyncio.run(main())
