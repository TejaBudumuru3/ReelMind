import os
import asyncpg
from dotenv import load_dotenv
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.embeddings import JinaEmbeddings
from datetime import datetime
import json
import asyncio
import core.db
from core.logging import get_logger

logger = get_logger("embeddings")

load_dotenv()

JINA_API_KEY = os.getenv("JINA_API")

splitter =  RecursiveCharacterTextSplitter(
    chunk_size=500,
    chunk_overlap=50
)

embedder = JinaEmbeddings(
    jina_api_key=JINA_API_KEY,
    model_name='jina-embeddings-v3'
)

async def embedd_and_store(transcript: str, job_id: str, session_id: str):

    chunks = splitter.split_text(transcript)

    if not chunks:
        raise Exception("No chunks generated - transcript may be empty")

    logger.info(f"Splits into { len(chunks) } chunks", extra={"job_id": job_id})

    try:
        # Wrap the synchronous embedder in a thread and enforce a 30 second timeout
        vectors = await asyncio.wait_for(
            asyncio.to_thread(embedder.embed_documents, chunks),
            timeout=30.0
        )
    except asyncio.TimeoutError:
        logger.error("Jina Embeddings timed out after 30 seconds", extra={"job_id": job_id})
        raise Exception("Embedding generation timed out. The Jina API is unresponsive.")
    except Exception as e:
        error_msg = str(e).lower()
        if "429" in error_msg or "rate limit" in error_msg or "quota" in error_msg:
            logger.error(f"Jina API Rate Limit Reached: {e}", extra={"job_id": job_id})
            raise Exception("Jina Embeddings daily quota exceeded. Please wait or upgrade your API key.")
        logger.error(f"Jina Embeddings failed: {e}", exc_info=True, extra={"job_id": job_id})
        raise

    logger.info(f"Generated { len(vectors) } vectors", extra={"job_id": job_id})


    if not core.db.pg_pool:
        raise Exception("Database pool is not initialized")
        
    async with core.db.pg_pool.acquire() as con:
        async with con.transaction():
            try:
                rows = [
                    (
                        job_id, 
                        session_id, 
                        chunk,
                        "[" + ",".join(str(v) for v in vector) + "]",
                        json.dumps({"total chunks": len(chunks), "char_count": len(chunk), "chunk_index": index}),
                        datetime.now(),
                        index
                    )
                    for index, (chunk, vector) in enumerate(zip(chunks, vectors))
                ]     

                await con.executemany("""
                    INSERT INTO "Chunk" 
                        (id, job_id, session_id, content, embedding, metadata, created_at, chunk_index)
                        VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3, $4::vector, $5::jsonb, $6::timestamp, $7)
                        """, rows)
                
                logger.info("Chunks inserted into database", extra={"job_id": job_id})
            except Exception as e:
                logger.error(f"Error inserting chunks: {e}", exc_info=True, extra={"job_id": job_id})
                raise