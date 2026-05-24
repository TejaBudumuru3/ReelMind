# ReelMind — Technical Screening Task Context

## Task Summary
Build a full-stack RAG chatbot that takes two social media video URLs, extracts
transcripts + metadata, stores embeddings in a vector DB, and enables a streaming
chat interface where creators can compare video performance using AI analysis.

## Hard Requirements
1. Two social media video URLs as input (YouTube, Instagram, TikTok, Shorts)
2. Pull transcript + metadata: views, likes, comments, creator, follower_count,
   hashtags, upload_date, duration
3. Compute engagement_rate = (likes + comments) / views × 100
4. Chunk + embed transcripts → vector DB (pgvector chosen)
   - Tag every chunk with video label (A or B)
5. RAG chat via LangChain or LangGraph with:
   - Streaming responses
   - Source citations (which video + which chunk)
   - Memory across turns
6. Frontend: side-by-side video cards + chat panel
7. Performance, speed, quality — not aesthetics

## Evaluation Criteria
- Highest quality, lowest cost to run at scale (1000 creators/day)
- Reasoning on why this stack was chosen
- Scalability — what breaks at 10,000 users
- GitHub: clean commits, README, .env.example, trade-off explanations
- Loom demo: full run start to finish, no bugs

## Our Tech Stack Decisions

| Layer | Chosen | Reason |
|---|---|---|
| Frontend | Next.js | Specified in task |
| Backend | FastAPI | Async, Python ecosystem matches ML stack |
| Orchestration | LangGraph | Stateful memory, streaming, better than LangChain for chat |
| Embeddings | NVIDIA NIM llama-nemotron-embed-1b-v2 | Free tier, 1024 dims, Matryoshka |
| Vector DB | pgvector (Neon) | Free tier, no extra service, cosine similarity |
| LLM | Groq Llama 3.3 70B | Fastest inference, free tier, streaming |
| Transcript P1 | youtube-transcript-api | Zero cost, instant for YouTube captions |
| Transcript P2 | yt-dlp + Groq Whisper | Universal fallback, all platforms |

## Pipeline Architecture

### Pipeline 1 — YouTube Captions (fast path)
- youtube-transcript-api → English captions
- Fallback: translate via YouTube API → fallback: Groq Llama translation
- If all fail → trigger Pipeline 2

### Pipeline 2 — yt-dlp + Whisper (universal)
- yt-dlp extracts metadata + direct audio URL (skip_download=True)
- httpx streams audio bytes into memory (no disk I/O)
- Groq Whisper large-v3-turbo transcribes
- YouTube stats patched via YouTube Data API v3 for accuracy
- Auth: cookies.txt for Instagram/TikTok

### Pipeline 3 — Chunking + Embedding
- RecursiveCharacterTextSplitter: chunk_size=500, chunk_overlap=50
- NVIDIA NIM embed_documents() — batched, 1 API call per video
- Raw SQL INSERT into pgvector Chunk table with vector::vector cast
- Each chunk tagged with job_id, session_id, chunk_index

## DB Schema (key tables)
- User → Session → Job (one per video) → Chunk (N per job)
- Job.label = "A" or "B" (assigned at creation in FastAPI endpoint)
- Chunk.embedding = vector(1024)
- Chunk.chunk_index for ordered retrieval

## RAG Chain (LangGraph)
- Node 1: retrieve — cosine similarity search on pgvector scoped to session_id
- Node 2: generate — Groq Llama 3.3 70B with system prompt containing both videos' metadata
- MemorySaver for cross-turn memory
- SSE streaming from FastAPI to frontend
- Source citations: return chunk_index + job label with each response

## Free Tier Limits
- Groq LLM: 30 RPM, 1000 RPD (Llama 3.3 70B)
- Groq Whisper: 20 RPM, 2000 RPD (large-v3-turbo)
- NVIDIA NIM: TBD — researching higher daily limit provider
- Neon Postgres: 0.5GB storage, 1 branch free

## Environment Variables Required
- DATABASE_URL — Neon PostgreSQL connection string
- YOUTUBE_API — Google YouTube Data API v3 key
- GROQ_API — Groq API key
- NVIDIA_API_KEY — NVIDIA NIM API key (or alternative embedding provider)

## Files
- apps/server/worker/yt-transcription.py — Pipeline 1 + 2 (universal ingest)
- apps/server/worker/embeddings.py — Pipeline 3 (chunking + embedding) [TODO]
- apps/server/rag/chain.py — LangGraph RAG chain [TODO]
- apps/server/rag/retriever.py — pgvector retriever [TODO]
- apps/server/main/main.py — FastAPI endpoints [TODO]
- apps/web/app/page.tsx — Next.js frontend [TODO]
- packages/db/prisma/schema.prisma — DB schema

## Key Trade-off Decisions to Defend in Demo
1. pgvector over Pinecone: No extra service, Neon free tier covers it,
   cosine similarity is sufficient for transcript chunks at this scale.
   Pinecone costs $70/month at 1M vectors.
2. Groq over OpenAI: 10x faster inference (250 t/s vs 40 t/s), free tier
   covers demo and early usage. OpenAI costs ~$15/1M tokens.
3. yt-dlp + Whisper over AssemblyAI: AssemblyAI costs $0.37/hour of audio.
   Groq Whisper is free tier. For 1000 creators/day with avg 5 min videos,
   AssemblyAI would cost ~$30/day = $900/month.
4. Chunk size 500/overlap 50: Balances semantic coherence with retrieval
   precision. Larger chunks (1000+) lose precision. Smaller (200) lose context.
5. NVIDIA NIM embeddings: Free, open-source model, 1024 dims = good retrieval
   quality without paying OpenAI $0.0001/1K tokens.
