import asyncpg
import os
from dotenv import load_dotenv
from worker.embeddings import embedder
load_dotenv()

async def retrive_chunks(query: str, session_id: str, top_k: int=5):
    query_vector = embedder.embed_query(query)

    vector_string = "["+",".join(str(v) for v in query_vector) + "]"

    con = await asyncpg.connect(os.getenv("DATABASE_URL"))

    try:
        rows = await con.fetch("""
            SELECT
                c.content,
                c.chunk_index,
                c.job_id,
                j.label, 
                j.title, 
                j.creator
            FROM "Chunk" c
            JOIN "Job" j ON c.job_id = j.id
            WHERE c.session_id = $1
            ORDER BY c.embedding <=> $2
            LIMIT $3
        """, session_id, vector_string, top_k)

        results = []
        for row in rows:
            results.append({
                "content": row['content'],
                "chunk_index": row['chunk_index'],
                "label": row['label'],
                'title': row['title'],
                'creator': row['creator'],
                'job_id': row['job_id']
            })
        
        return results
    except Exception as e:
        print(f"Error in retriving chunks: {e}")
        return []
    finally:
        await con.close()


if __name__ == "__main__":
    import asyncio
    results = asyncio.run(retrive_chunks("what was the hook?", "ae0326cb-449b-4b96-ab90-671bb01fb8e9"))
    for r in results:
        print(f"[Video {r['label']}, Chunk {r['chunk_index']}]: {r['content']}")