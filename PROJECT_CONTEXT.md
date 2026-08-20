# ReelMind — Verified Master Technical Context

**Last Verified Against Codebase:** 2026-08-19

---

## 1. Project Identity

**ReelMind** is an AI-powered video analytics platform that lets creators paste two social media video URLs, automatically extracts metadata + transcripts, embeds them as vectors, and provides a streaming RAG chat interface for data-driven content strategy insights.

**Monorepo Structure:**
```
ReelMind/
├── apps/web/          → Next.js 16 frontend (Vercel-deployed)
├── apps/server/       → FastAPI backend (Docker-deployed)
├── packages/db/       → Shared Prisma schema (dual TS + Python client gen)
├── files/             → Dev context docs, cookies, test scripts
├── Dockerfile         → Python 3.11-slim backend container
└── .vercelignore      → Excludes server/ from Vercel builds
```

---

## 2. Exact Technology Versions (From package.json + requirements.txt)

### Frontend (`apps/web/package.json`)
| Package | Version | Purpose |
|---|---|---|
| next | 16.2.6 | App Router framework |
| react / react-dom | 19.2.4 | UI library |
| @prisma/client | ^5.17.0 | Server-side DB queries |
| framer-motion | ^12.40.0 | Page transitions, animations |
| lucide-react | ^1.16.0 | Icon library |
| react-markdown | ^10.1.0 | AI response rendering |
| uuid | ^14.0.0 | **UNUSED** — installed but never imported anywhere in `src/` |

### Backend (`apps/server/requirements.txt`)
| Package | Version | Purpose |
|---|---|---|
| fastapi | 0.136.1 | REST API framework |
| uvicorn | 0.46.0 | ASGI server |
| prisma | 0.15.0 | Python ORM client |
| langchain | 1.3.1 | LLM prompt orchestration |
| **langgraph** | **1.2.0** | **INSTALLED but NEVER IMPORTED in any .py file** |
| langchain-groq | 1.1.2 | Groq LLM integration |
| langchain-text-splitters | 1.1.2 | Recursive text chunking |
| langchain-community | (latest) | Jina embeddings wrapper |
| groq | 0.37.1 | Whisper STT + LLM translation |
| asyncpg | 0.31.0 | Raw async PostgreSQL queries |
| google-api-python-client | 2.196.0 | YouTube Data API v3 |
| yt-dlp | (latest) | Universal video metadata + audio |
| youtube-transcript-api | (latest) | YouTube caption extraction |
| isodate | (latest) | ISO 8601 duration parsing |
| qstash | 3.4.0 | Upstash message queue SDK |
| httpx | 0.28.1 | Async HTTP client |

### Database
| Tech | Details |
|---|---|
| PostgreSQL | With `vector` extension (pgvector) |
| Prisma Schema | Dual generator: `client_ts` for Next.js, `client_python` for FastAPI |

---

## 3. Database Schema (Exact — `packages/db/prisma/schema.prisma`)

### Entities
1. **`User`** — `id (UUID)`, `email (unique)`, `api_credits (default 10)`, `created_at`
2. **`Session`** — `id (UUID)`, `user_id → User`, `title (default "New Chat")`, `created_at`, `updated_at`
3. **`Job`** — `id (UUID)`, `session_id → Session`, `video_id?`, `creator?`, `title?`, `follower_count? (BigInt)`, `hashtags (String[])`, `label? (default "A")`, `thumbnail_url?`, `upload_date?`, `duration? (Int)`, `platform?`, `url`, `status (PENDING|PROCESSING|COMPLETED|FAILED)`, `views (BigInt, default 0)`, `likes (BigInt, default 0)`, `comments (BigInt, default 0)`, `engagement_rate (Decimal 5,2)`, `error_message?`, `transcript?`, `created_at`, `updated_at`
4. **`Message`** — `id (UUID)`, `session_id → Session`, `role (USER|AI)`, `content`, `created_at`
5. **`Chunk`** — `id (UUID)`, `job_id → Job`, `session_id → Session`, `content`, `chunk_index (Int)`, `embedding (vector(1024))?`, `metadata (Json)?`, `created_at`

### Indexes
- `Message` → `@@index([session_id])`
- `Job` → `@@index([session_id])`, `@@index([video_id])`
- `Chunk` → `@@index([session_id])`, `@@index([job_id])`
- **NO vector index** exists (no HNSW or IVFFlat on `Chunk.embedding`)

### Cascade Behavior
All child entities (`Session → Job, Message, Chunk`) cascade on delete from parent.

---

## 4. API Endpoints (Exact — `apps/server/main/main.py`)

| Method | Path | Auth | Behavior |
|---|---|---|---|
| `POST` | `/ingest` | None | Validates session, decrements credit, creates Job, publishes to QStash. Returns `{job_id, message_id}`. Rolls back credit on failure. Caps at 2 jobs per session. Deletes prior FAILED jobs before creating new ones. |
| `POST` | `/worker` | QStash Signature | Verifies `Upstash-Signature` header. Calls `async_pipeline_link_to_text()`. On failure, marks job FAILED and returns 200 to prevent QStash retries. |
| `GET` | `/job/{job_id}/status` | None | Returns `{status, error}`. On COMPLETED, includes `job_data` with label, creator, title, platform, thumbnail, views, likes, comments, engagement_rate, follower_count, duration. |
| `POST` | `/chat` | None | Saves user message, then returns `StreamingResponse` (SSE). Saves full AI response after stream ends. |

### CORS Configuration
```python
allow_origins=["*"], allow_methods=["*"], allow_credentials=True, allow_headers=["*"]
```
**⚠️ Production Risk:** Wildcard origin with `allow_credentials=True` is a security vulnerability.

---

## 5. Ingestion Pipeline (Exact — `apps/server/worker/ingest.py`)

### Entry Point: `async_pipeline_link_to_text(job_id, url)`

**Idempotency Guard:** If job status is already `COMPLETED`, `FAILED`, or `PROCESSING`, the function returns immediately (prevents QStash retry duplication).

### Duration Limit
All videos capped at **900 seconds (15 minutes)**. Exceeding this causes immediate `FAILED` status.

### Cache Check (Deduplication)
Before processing, checks if `video_id` already exists in another COMPLETED job. On cache hit: copies all metadata + duplicates chunks via raw SQL `INSERT ... SELECT` with `gen_random_uuid()`.

### YouTube Full Path (when Data API returns items)
1. Extract video ID via regex (`extract_youtube_id` in `youtube.py`)
2. Hit YouTube Data API v3 for `statistics`, `snippet`, `contentDetails`
3. Parse ISO 8601 duration via `isodate`
4. Calculate engagement rate: `(likes + comments) / views × 100`
5. Extract hashtags from title + description via regex
6. Select best thumbnail (maxres > high > default)
7. Run 6-tier transcript cascade (see below)

### YouTube Shorts-Only Path (when Data API returns no items)
Sets minimal metadata (title = "YouTube Short {id}", thumbnail from i.ytimg.com). Then runs same 6-tier transcript cascade.

### 6-Tier YouTube Transcript Cascade
Each tier tries multiple cookie/proxy configurations internally:
1. **`youtube-transcript-api`** with cookies + proxy combos (up to 4 sub-configs)
2. **`youtube-transcript-api` via residential proxy** (`GenericProxyConfig`)
3. **Innertube watch-page scraping** — parses `ytInitialPlayerResponse` JSON from HTML, extracts `captionTracks[].baseUrl`, downloads XML captions
4. **`yt-dlp` caption extraction** — uses embedded player clients (`android_embed`, `ios_embed`, `android_sdkless`, `tv_embedded`), parses JSON3/SRV1/VTT formats
5. **Public Invidious API instances** — fetches instance list from `api.invidious.io`, queries up to 10 instances
6. **Full audio download → Groq Whisper Large v3** (final fallback)

Each tier includes translation logic: try English → try YouTube translation → fallback to Groq Llama 3.3 translation.

### Non-YouTube Path (Instagram, TikTok, X, Facebook)
1. `yt-dlp` metadata extraction with cookies + proxy
2. Retry without proxy on failure
3. Duration limit check (900s)
4. Cache deduplication check
5. `get_transcription_from_groq()`:
   - Detects protocol type (HLS/m3u8 vs direct URL)
   - HLS: downloads all segments via `httpx`, concatenates bytes in memory
   - Direct: single `httpx.get()` with 120s timeout
   - Sends bytes to `groqClient.audio.transcriptions.create(model='whisper-large-v3')`

### pg_notify Usage
Every successful completion or failure triggers: `SELECT pg_notify('job_updates', '{job_id}')`.
**⚠️ Critical Finding: There is NO corresponding `LISTEN` subscriber anywhere.** The `pg_notify` calls fire into the void. The frontend uses HTTP polling, not PostgreSQL LISTEN/NOTIFY.

---

## 6. Embedding Pipeline (Exact — `apps/server/worker/embeddings.py`)

- **Splitter:** `RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)`
- **Embedder:** `JinaEmbeddings(model_name='jina-embeddings-v3')` — 1024 dimensions
- **Embedding call:** `embedder.embed_documents(chunks)` run in thread via `asyncio.to_thread()`
- **Storage:** Direct `asyncpg` connection → `executemany` bulk insert with `$4::vector` cast
- **No connection pooling:** Each call opens a fresh `asyncpg.connect()` and closes it after insert

---

## 7. RAG Chain (Exact — `apps/server/rag/`)

### Vector Retrieval (`retrieval.py`)
- Embeds query via `embedder.embed_query(query)` (synchronous, blocks event loop)
- Opens fresh `asyncpg.connect()` per call
- Cosine distance search: `ORDER BY c.embedding <=> $2 LIMIT $3` (default top_k=5)
- JOINs `Job` table to include `label`, `title`, `creator` per chunk
- Scoped to `session_id` only — **no per-video partitioning**

### System Prompt Construction (`retrieval_chain.py`)
- Fetches all jobs for the session (metadata)
- Builds structured prompt with exact stats: Views, Likes, Comments, Engagement Rate formula, Duration, Followers, Hashtags
- Retrieved chunks formatted as `**Video {label}**: {content}`

### Chat History (`retrieval_chain.py`)
- Opens fresh `Prisma()` connection per call
- Fetches last 20 messages ordered by `created_at ASC`
- Converts to LangChain `HumanMessage`/`AIMessage` objects
- **No token budget enforcement** — raw 20-message limit regardless of content length

### LLM Configuration
- Model: `llama-3.3-70b-versatile`
- Provider: `ChatGroq`
- Temperature: 0.3
- Streaming: True
- Chain: `ChatPromptTemplate | ChatGroq` (simple pipe, **NOT LangGraph**)

---

## 8. Frontend Architecture (Exact — `apps/web/src/`)

### Pages
| Route | File | Type |
|---|---|---|
| `/` | `app/page.tsx` | Client component — Landing page with URL inputs |
| `/session/[id]` | `app/session/[id]/page.tsx` | Client component — Video cards + chat |
| `/history` | `app/history/page.tsx` | Client component — Past sessions list |

### Server Actions (`app/actions.ts`)
- `createSessionAction()`: Creates guest user (email: `guest_{timestamp}@reelmind.ai`) via cookie, creates session. **No user authentication system.**
- `getHistoryAction()`: Fetches sessions for current cookie user with associated jobs.

### API Client (`lib/api.ts`)
Single function: `ingestVideo(url, sessionId, label)` — POST to `/ingest`, throws on non-OK response.

### Components
1. **`VideoCard.tsx`**: Renders video metadata (thumbnail, views, likes, comments, engagement rate). Has three states: NONE (add video input), FAILED (error + retry input), and data display. Uses `formatNumber()` for K/M suffixes.
2. **`ChatPanel.tsx`**: SSE streaming consumer. Reads `data: {text: "..."}` events. Renders via `ReactMarkdown`. Shows blinking cursor during streaming. Auto-scrolls on every message update.
3. **`ProcessingOverlay.tsx`**: Modal overlay with hardcoded 8-stage text rotation on 4-second intervals. **Completely disconnected from actual backend progress.**

### Styling
- `globals.css`: Midnight Glass theme with CSS custom properties. Glassmorphism utility class `.glass-panel`. Custom scrollbar styling. Markdown prose styles.
- `page.module.css`: **Default Next.js boilerplate — NOT USED by any component.** Dead file.
- All component styles use inline `React.CSSProperties` objects.

### Missing Next.js Patterns
- **No `error.tsx`** error boundary in any route
- **No `loading.tsx`** loading states
- **No `not-found.tsx`** 404 handling
- **No `metadata` export** in session or history pages (only root layout has it)

---

## 9. Dead Code & Unused Dependencies

| Item | Location | Status |
|---|---|---|
| `langgraph` package | `requirements.txt` L12 | **Installed but never imported** in any Python file |
| `uuid` package | `web/package.json` L22 | **Installed but never imported** in any TSX/TS file |
| `page.module.css` | `app/page.module.css` | **143-line file never imported** by any component |
| `async_transcription_pipeline()` | `youtube.py` L638-730 | **Legacy function** — earlier prototype, replaced by `async_pipeline_link_to_text` in `ingest.py`. Only called from `__main__` block. |
| `pg_notify` calls | `ingest.py` (16 locations), `main.py` (1 location) | **Fire into void** — no LISTEN subscriber exists anywhere |
| `public/` SVG assets | `file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg` | **Default Next.js scaffolding**, unused |

---

## 10. Security & Safety Audit

| # | Issue | File | Severity | Detail |
|---|---|---|---|---|
| **S1** | SQL Injection via f-strings | `ingest.py` L360-365, L574-579 | **HIGH** | Chunk copy SQL uses f-string interpolation with `job_id` and `session_id`. While these are UUIDs from the database (not user input), this pattern is dangerous if any upstream validation is ever relaxed. |
| **S2** | Wildcard CORS + Credentials | `main.py` L38-44 | **HIGH** | `allow_origins=["*"]` with `allow_credentials=True` allows any domain to make authenticated requests. Browsers actually block this combo, but it signals a misconfiguration. |
| **S3** | No Authentication | Entire API | **HIGH** | All endpoints are fully open. Any client can create sessions, ingest videos, and chat. No API keys, no JWT, no rate limiting. |
| **S4** | No Input Validation on URLs | `main.py` `/ingest` | **MEDIUM** | URL field accepts any string. No validation that it's actually a video URL before decrementing credits and queuing a job. |
| **S5** | Unguarded Audio Memory Buffer | `ingest.py` L191-225, L244-249 | **MEDIUM** | HLS audio segments concatenated in memory without size limits. A malicious long-form audio URL could cause OOM. |
| **S6** | Cookie Secret Not Signed | `actions.ts` L20 | **MEDIUM** | `cookieStore.set("userId", userId)` stores raw UUID in an unsigned cookie. Users can forge arbitrary user IDs. |

---

## 11. Production Scalability Verdict: Can It Handle 1,000 Users/Day?

### Bottleneck Analysis

#### External API Rate Limits (The Hard Wall)

| Service | Free Tier Limit | Per User (2 videos) | 1,000 Users/Day Needs | Verdict |
|---|---|---|---|---|
| **Groq Whisper** | 20 RPM, 2,000 RPD | 0-2 calls (only non-YT or fallback) | Up to 2,000 calls | ⚠️ **AT LIMIT** — hits ceiling if most videos need Whisper |
| **Groq Llama 3.3 70B** | 30 RPM, 1,000 RPD | 1+ chat messages + potential translations | 3,000-10,000+ calls | ❌ **WILL FAIL** — 1,000 RPD limit broken on first day |
| **Jina Embeddings v3** | Varies (~500 RPD free) | 1 call per video (batched chunks) | 2,000 calls | ❌ **WILL FAIL** — free tier insufficient |
| **YouTube Data API v3** | 10,000 quota units/day | 1 unit per video | 2,000 units | ✅ **OK** — within quota |
| **Upstash QStash** | 500 messages/day (free) | 2 messages per user | 2,000 messages | ❌ **WILL FAIL** — 4x over free limit |

#### Infrastructure Bottlenecks

| Component | Current Architecture | Breaking Point | Impact |
|---|---|---|---|
| **Database Connections** | New `Prisma()` + `asyncpg.connect()` per request | ~20-50 concurrent users | PostgreSQL `max_connections` exhausted |
| **Uvicorn Workers** | Single worker (default `uvicorn` without `--workers`) | ~10 concurrent requests | Worker blocked during synchronous embedding calls |
| **Embedding Generation** | `asyncio.to_thread(embedder.embed_documents)` | Blocks thread pool | Thread pool saturation under load |
| **Vector Search** | No HNSW/IVFFlat index on 1024-dim column | ~50,000 chunks | Full table scan becomes >1s per query |
| **Memory** | Audio fully loaded into RAM | Any video >50MB audio | OOM on containerized environments (256-512MB limits) |
| **Docker** | Single `CMD uvicorn` with no process manager | Any crash = full downtime | No auto-restart, no health checks |

### Production Readiness Score

```
┌──────────────────────────────────┬───────────┐
│ Dimension                        │ Score     │
├──────────────────────────────────┼───────────┤
│ Core Pipeline Logic              │ ✅ Solid   │
│ Error Recovery (Worker)          │ ✅ Good    │
│ Database Schema Design           │ ✅ Good    │
│ API Rate Limit Handling          │ ❌ None    │
│ Connection Pooling               │ ❌ None    │
│ Authentication & Authorization   │ ❌ None    │
│ Structured Logging               │ ❌ None    │
│ Vector Index Optimization        │ ❌ None    │
│ Frontend Error Boundaries        │ ❌ None    │
│ Input Validation                 │ ❌ Minimal │
│ Monitoring & Observability       │ ❌ None    │
│ CI/CD Pipeline                   │ ❌ None    │
├──────────────────────────────────┼───────────┤
│ OVERALL: 1,000 users/day         │ ❌ NO      │
└──────────────────────────────────┴───────────┘
```

**Verdict:** The pipeline logic is well-engineered with robust fallback strategies, but the surrounding infrastructure (connection management, rate limiting, auth, observability) is entirely absent. As currently architected, the system would break at approximately **30-50 concurrent users** due to connection pool exhaustion and at **~500 users/day** due to Groq RPD limits.

---

## 12. Complete Error Registry

| Ref | Layer | File:Line | Description | Impact |
|---|---|---|---|---|
| E1 | Database | `main.py:48,191,219`, `ingest.py:274`, `retrieval.py:12`, `retrieval_chain.py:12,73`, `embeddings.py:38` | Fresh connection per call (8 locations) | Connection exhaustion under load |
| E2 | RAG | `retrieval.py:15-28` | Global top-K without per-video partitioning | Biased context → hallucinated comparisons |
| E3 | Polling | `session/[id]/page.tsx:31-43` | `data.error` never extracted from poll response | Real error messages never shown to users |
| E4 | SSE | `main.py:232-248` | No try/except around stream token iteration | Silent hang on Groq disconnect/rate-limit |
| E5 | Memory | `ingest.py:191-225,244-249` | Unbounded audio buffer in RAM | OOM crash on large videos |
| E6 | DRY | `ingest.py:380-516` | Identical 6-tier fallback duplicated (YouTube vs Shorts) | Maintenance burden, divergent bug fixes |
| E7 | Types | `schema.prisma` + `actions.ts` | BigInt fields in Prisma → JSON serialization | Runtime TypeError in Server Actions |
| E8 | Context | `retrieval_chain.py:78-80` | `take=20` without token budget check | Context overflow at Groq TPM limits |
| E9 | UX | `ProcessingOverlay.tsx:6-14,20-24` | Hardcoded 4s timer, 8 fake stages | Disconnected from real pipeline state |
| E10 | Dead Code | `youtube.py:638-730` | `async_transcription_pipeline()` legacy function | Confusion, unused code shipped |
| E11 | Dead Code | `ingest.py` (16 locations) | `pg_notify` with no LISTEN subscriber | Wasted DB roundtrips, misleading architecture |
| E12 | Blocking | `retrieval.py:8` | `embedder.embed_query()` is synchronous | Blocks asyncio event loop during vector search |
| E13 | Security | `actions.ts:20` | Unsigned cookie stores raw userId UUID | Cookie forgery → access any user's data |
| E14 | Security | `main.py:40` | `allow_origins=["*"]` with credentials | CORS misconfiguration |
| E15 | Logging | Entire backend | All logging via `print()` statements | No structured logging, no log levels, no correlation IDs |
| E16 | Frontend | `app/` directory | No `error.tsx`, `loading.tsx`, `not-found.tsx` | Unhandled errors crash to white screen |
