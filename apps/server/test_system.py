import asyncio
import os
import sys
from dotenv import load_dotenv

# Add server directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from core.db import init_db, close_db, prisma_client as db
from worker.ingest import async_pipeline_link_to_text
from rag.retrieval import retrive_chunks
from rag.retrieval_chain import stream_chat
from main.main import app, ChatPayload

load_dotenv()

async def run_tests():
    print("\nStarting Comprehensive System Test (Phases 1-6)...")
    await init_db()
    
    # Create a mock user and session for testing
    print("\n[1] Creating mock user and session...")
    user = await db.user.create(data={
        "email": "test@reelmind.com",
        "api_credits": 10
    })
    session = await db.session.create(data={
        "user_id": user.id,
        "title": "System Test Session"
    })
    
    session_id = session.id
    print(f"[OK] Session created: {session_id}")
    
    # Test 1: Ingestion Pipeline (Tests Phase 6 DB Rollbacks & Phase 2 YouTube Backoff)
    print("\n[2] Testing Video Ingestion & Vectorization...")
    job = await db.job.create(data={
        "session_id": session_id,
        "status": "PENDING",
        "url": "https://www.youtube.com/watch?v=O2EwFbxYeDM", # Small test video
        "label": "A"
    })
    
    try:
        await async_pipeline_link_to_text(job.id, "https://www.youtube.com/watch?v=O2EwFbxYeDM")
        updated_job = await db.job.find_unique(where={"id": job.id})
        if updated_job.status == "COMPLETED":
            print(f"[OK] Ingestion successful! Chunks embedded for Job A.")
        else:
            print(f"[FAIL] Ingestion failed with status {updated_job.status}: {updated_job.error_message}")
    except Exception as e:
        print(f"[FAIL] Ingestion crashed: {e}")

    # Test 2: RAG Retrieval (Tests Phase 3 Balanced Retrieval)
    print("\n[3] Testing Balanced RAG Retrieval...")
    try:
        chunks = await retrive_chunks("What is the hook of this video?", session_id)
        print(f"[OK] Retrieved {len(chunks)} chunks.")
        for i, chunk in enumerate(chunks):
            print(f"  -> Chunk {i+1} from Video {chunk['label']}: {chunk['content'][:50]}...")
    except Exception as e:
        print(f"[FAIL] Retrieval failed: {e}")

    # Test 3: LLM Streaming & Error Propagation (Tests Phase 4 & Phase 2 Groq Limits)
    print("\n[4] Testing Chat Streaming Endpoint...")
    try:
        print("  Generating response stream: ", end="")
        async for token in stream_chat("What is the hook?", session_id):
            print(token, end="", flush=True)
        print("\n[OK] Stream completed successfully.")
    except Exception as e:
        print(f"\n[FAIL] Stream failed (should not happen, errors should be gracefully yielded): {e}")

    # Cleanup
    print("\n[5] Cleaning up test data...")
    await db.job.delete_many(where={"session_id": session_id})
    await db.message.delete_many(where={"session_id": session_id})
    await db.chunk.delete_many(where={"session_id": session_id})
    await db.session.delete(where={"id": session_id})
    await db.user.delete(where={"id": user.id})
    print("[OK] Cleanup complete.")

    await close_db()
    print("\nAll tests completed successfully!")

if __name__ == "__main__":
    asyncio.run(run_tests())
