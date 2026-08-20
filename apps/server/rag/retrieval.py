import os
from dotenv import load_dotenv
from worker.embeddings import embedder
import core.db
from core.logging import get_logger

logger = get_logger("retrieval")

load_dotenv()
async def retrive_chunks(query: str, session_id: str, focus_job_id: str = None, top_k_per_video: int=3, stride_count: int = 2):
    query_vector = embedder.embed_query(query)

    vector_string = "["+",".join(str(v) for v in query_vector) + "]"

    if not core.db.pg_pool:
        raise Exception("Database pool is not initialized")
        
    async with core.db.pg_pool.acquire() as con:
        try:
            query_str = f"""
                WITH BaseChunks AS (
                    SELECT 
                        c.content, c.chunk_index, c.job_id,
                        j.label, j.title, j.creator,
                        c.embedding <=> $2 as distance,
                        ROW_NUMBER() OVER( PARTITION BY c.job_id ORDER BY c.embedding <=> $2) as rnk,
                        MAX(c.chunk_index) OVER (PARTITION BY c.job_id) as max_chunk
                    FROM "Chunk" c
                    JOIN "Job" j ON c.job_id = j.id
                    WHERE c.session_id = $1
                    {f"AND c.job_id = $5" if focus_job_id else ""}
                ),
                SemanticHits AS (
                    SELECT * FROM BaseChunks WHERE rnk <= $3
                ),
                Anchor AS (
                    SELECT * FROM BaseChunks WHERE chunk_index = 0 OR chunk_index = max_chunk
                ),
                Strides AS (
                    SELECT * from BaseChunks
                    WHERE max_chunk > 4
                        AND chunk_index > 0
                        AND chunk_index < max_chunk
                        AND (chunk_index % GREATEST(1, max_chunk / ($4 + 1))) = 0
                )
                SELECT DISTINCT ON (job_id, chunk_index)
                    content, chunk_index, job_id, label, title, creator, max_chunk
                FROM (
                    SELECT * FROM SemanticHits
                    UNION ALL
                    SELECT * FROM Anchor
                    UNION ALL
                    SELECT * FROM Strides
                ) combined
                ORDER BY job_id, chunk_index, distance
            """
            
            args = [session_id, vector_string, top_k_per_video, stride_count]
            if focus_job_id:
                args.append(focus_job_id)
                
            rows = await con.fetch(query_str, *args)

            results = []
            for row in rows:
                results.append({
                    "content": row['content'],
                    "chunk_index": row['chunk_index'],
                    "label": row['label'],
                    'title': row['title'],
                    'creator': row['creator'],
                    'job_id': row['job_id'],
                    'max_chunk': row['max_chunk']
                })
            
            return results
        except Exception as e:
            logger.error(f"Error in retriving chunks: {e}", exc_info=True)
            return []


if __name__ == "__main__":
    import asyncio
    results = asyncio.run(retrive_chunks("what was the hook?", "ae0326cb-449b-4b96-ab90-671bb01fb8e9"))
    for r in results:
        print(f"[Video {r['label']}, Chunk {r['chunk_index']}]: {r['content']}")