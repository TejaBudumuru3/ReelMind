import os
import asyncpg
from dotenv import load_dotenv
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.embeddings import JinaEmbeddings
from datetime import datetime
import json
import asyncio

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

    print(f"Splits into { len(chunks) } chunks")

    vectors = await asyncio.to_thread(embedder.embed_documents, chunks)

    print(f"Generated { len(vectors) } vectors")


    con = await asyncpg.connect(os.getenv("DATABASE_URL"))

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
        
        print("Chunks inserted into database")
    except Exception as e:
        print(f"Error inserting chunks: {e}")
        raise
    finally:
        await con.close()