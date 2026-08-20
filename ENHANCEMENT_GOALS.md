# ReelMind — Product Enhancement Goal Plan
# Target: Production-Grade System Handling 1,000+ Users/Day

**Created:** 2026-08-19
**Status:** PENDING APPROVAL
**Prerequisite:** Read `PROJECT_CONTEXT.md` for full codebase understanding

---

## Goal Statement

Transform ReelMind from a working prototype into a production-grade product capable of reliably serving 1,000 creators per day with zero-downtime ingestion, sub-second chat responses, and a polished UI/UX that converts first-time visitors.

---

## Phase 1: Backend Infrastructure & Resilience
**Priority:** CRITICAL — System breaks at ~30 concurrent users without this
**Estimated Scope:** 8 files modified, 2 new files

### 1.1 Connection Pool Architecture
**Problem:** 8 locations create fresh `Prisma()` or `asyncpg.connect()` per request, exhausting PostgreSQL `max_connections` (~20-100 on free tiers).

**Goal:**
- [ ] Create a FastAPI lifespan context manager that initializes ONE shared Prisma client and ONE `asyncpg.Pool` at server boot
- [ ] Inject the shared pool into all route handlers and worker functions via dependency injection or module-level singletons
- [ ] Remove all per-request `db = Prisma(); await db.connect()` and `await asyncpg.connect()` calls
- [ ] Configure pool sizing: `min_size=5, max_size=20` for asyncpg

**Files to modify:**
- `apps/server/main/main.py` — Add lifespan manager, refactor all 4 endpoints
- `apps/server/worker/ingest.py` — Accept pool as parameter instead of creating connections
- `apps/server/worker/embeddings.py` — Use shared asyncpg pool
- `apps/server/rag/retrieval.py` — Use shared asyncpg pool
- `apps/server/rag/retrieval_chain.py` — Use shared Prisma client

### 1.2 Structured Logging
**Problem:** Entire backend uses bare `print()` statements. No log levels, no timestamps, no correlation IDs.

**Goal:**
- [ ] Replace all `print()` with Python `logging` module using structured JSON format
- [ ] Add `job_id` correlation to all worker log lines
- [ ] Add `session_id` correlation to all RAG/chat log lines
- [ ] Configure log levels: DEBUG for dev, INFO for production

**New file:** `apps/server/core/logging.py`

### 1.3 Uvicorn Production Configuration
**Problem:** Single uvicorn worker with default settings. One crash = total downtime.

**Goal:**
- [ ] Configure multi-worker uvicorn: `--workers 4` (or gunicorn with uvicorn workers)
- [ ] Add health check endpoint: `GET /health`
- [ ] Update Dockerfile with process manager (gunicorn)
- [ ] Add `SIGTERM` graceful shutdown handler

**Files to modify:**
- `Dockerfile` — Switch to gunicorn + uvicorn workers
- `apps/server/main/main.py` — Add `/health` endpoint

---

## Phase 2: API Rate Limiting & External Service Resilience
**Priority:** CRITICAL — Groq free tier hard-caps at 1,000 RPD for LLM
**Estimated Scope:** 3 new files, 4 files modified

### 2.1 Groq Rate Limit Strategy
**Problem:** Groq Llama 3.3 70B free tier: 30 RPM / 1,000 RPD. With 1,000 users averaging 3 chat messages each = 3,000 LLM calls/day → 3× over the limit.

**Goal:**
- [ ] Implement token bucket rate limiter for Groq API calls
- [ ] Add automatic fallback to secondary LLM provider (e.g., Groq Llama 3.1 8B for lighter queries, or self-hosted Ollama)
- [ ] Queue LLM requests with backpressure when approaching RPM limits
- [ ] Track daily usage counter and return graceful "capacity reached" messages

### 2.2 Jina Embeddings Rate Limit Strategy
**Problem:** Jina free tier has limited daily requests. 2,000 embedding calls/day (1 per video, batched chunks) may exceed limits.

**Goal:**
- [ ] Add request counting and daily limit tracking for Jina API
- [ ] Implement embedding result caching — if the same transcript text is re-embedded, serve from cache
- [ ] Consider fallback to local sentence-transformers model for overflow

### 2.3 QStash Quota Management
**Problem:** QStash free tier: 500 messages/day. 1,000 users × 2 videos = 2,000 messages.

**Goal:**
- [ ] Evaluate upgrading QStash plan vs. replacing with direct async background task (FastAPI `BackgroundTasks` or `asyncio.create_task`)
- [ ] For development: implement direct worker invocation mode that bypasses QStash entirely when `QSTASH_TOKEN` is not set

### 2.4 Per-User API Rate Limiting
**Problem:** No rate limiting on any endpoint. A single user can spam `/ingest` or `/chat` and exhaust all credits/resources.

**Goal:**
- [ ] Add per-IP rate limiting middleware (e.g., `slowapi` or custom)
- [ ] Limit: 10 ingestions per hour per user, 60 chat messages per hour per user
- [ ] Return `429 Too Many Requests` with `Retry-After` header

---

## Phase 3: RAG Engine Quality & Accuracy
**Priority:** HIGH — Directly impacts chat response quality
**Estimated Scope:** 3 files modified

### 3.1 Balanced Per-Video Retrieval
**Problem:** Global `LIMIT 5` cosine search returns chunks biased toward one video if it has denser keyword matches. User asks "Compare the hooks" but gets 5 chunks from Video A and 0 from Video B.

**Goal:**
- [ ] Modify `retrive_chunks()` to accept list of `job_ids`
- [ ] Execute separate cosine queries per video: top 3 from Video A + top 3 from Video B
- [ ] Merge and re-rank results before returning
- [ ] Handle single-video sessions gracefully (all 5 from one video)

**File:** `apps/server/rag/retrieval.py`

### 3.2 Token-Aware Context Window
**Problem:** Fixed `take=20` messages regardless of content length. Long conversations + metadata + chunks can exceed model context or Groq TPM limits.

**Goal:**
- [ ] Implement character/token estimator for accumulated context
- [ ] Enforce maximum context budget (e.g., 12,000 tokens for Llama 3.3 70B prompt)
- [ ] Use sliding window: keep first 2 messages (system context) + last N messages that fit budget
- [ ] Summarize older messages if needed

**File:** `apps/server/rag/retrieval_chain.py`

### 3.3 Async Query Embedding
**Problem:** `embedder.embed_query(query)` in `retrieval.py:8` is a synchronous call that blocks the asyncio event loop.

**Goal:**
- [ ] Wrap in `asyncio.to_thread()` like the document embedding already does
- [ ] This unblocks the event loop during the ~200ms Jina API call

**File:** `apps/server/rag/retrieval.py`

### 3.4 Vector Index Creation
**Problem:** No HNSW or IVFFlat index on `Chunk.embedding`. Currently doing brute-force sequential scan.

**Goal:**
- [ ] Create HNSW index: `CREATE INDEX ON "Chunk" USING hnsw (embedding vector_cosine_ops)`
- [ ] Add migration script for existing data
- [ ] Monitor query performance: target <50ms for top-5 retrieval at 100k chunks

### 3.5 Stratified Sampling RAG (Hybrid Retrieval)
**Problem:** Standard RAG semantic search fails for three categories of user queries:
- **Structural queries** ("Compare the hooks", "What was the CTA?") — semantic search misses chronological positions because "hook" doesn't literally appear in the transcript.
- **Broad analytical queries** ("Summarize both videos", "How to improve content quality?", "What topics were covered?") — top-K semantic search returns 2-3 scattered fragments, giving the LLM no sense of the full narrative arc, pacing, or topic flow.
- **Comparative queries** ("Which video had better storytelling?") — requires understanding the full structure of BOTH videos, not random snippets.

Only **specific/topical queries** ("Did they mention Apple watches?") work correctly with the current pure-semantic approach.

**Status:** ✅ COMPLETED
**Architecture:** Stratified Sampling + Semantic Search (Hybrid)
**Files:** `apps/server/rag/retrieval.py` (primary), `apps/server/rag/retrieval_chain.py` (minor formatting update)

**Goal:**
Refactor `retrive_chunks()` to return a hybrid mix of chunks that guarantees broad transcript coverage regardless of query type:

1. **Structural Anchors** — Always return `chunk_index = 0` (Hook) and `chunk_index = MAX` (Ending/CTA) per video
2. **Semantic Matches** — Top K chunks by cosine similarity per video (existing behavior, kept intact)
3. **Stride Samples** — Evenly-spaced chunks across the full transcript timeline per video (e.g., every Nth chunk based on total count)
4. **Deduplication** — `DISTINCT ON (job_id, chunk_index)` to avoid returning the same chunk twice when it appears in multiple categories
5. **Chronological Ordering** — Final results ordered by `label, chunk_index` so the LLM receives chunks in timeline order, not relevance order

**Example output for a 30-chunk video (top_k=3, stride_count=2):**
| Source | Chunks Returned |
|---|---|
| Anchor | 0, 29 |
| Semantic | 14, 22, 7 |
| Stride | 10, 20 |
| **After dedup** | **0, 7, 10, 14, 20, 22, 29** (~7 chunks = 23% coverage) |

**Token budget:** ~7 chunks × 500 chars × 2 videos = ~7,000 chars ≈ ~1,750 tokens. Well within limits for 15-minute videos.

**Checklist:**
- [x] Rewrite the SQL query in `retrive_chunks()` using CTE UNION approach
- [x] Add `stride_count` parameter (default 2) to control how many evenly-spaced samples are included
- [x] Deduplicate results across all three sources
- [x] Order final results chronologically (`label, chunk_index`) instead of by relevance
- [x] Update chunk formatting in `build_system_prompt()` to include `[Chunk N of M]` positional label
- [x] Test with: "Compare the hooks", "Summarize both videos", "How to improve quality?", "Did they mention X?"

---

## Phase 4: Streaming & Error Propagation
**Priority:** HIGH — Users see broken/confusing states on failures
**Estimated Scope:** 4 files modified

### 4.1 SSE Stream Error Handling
**Problem:** If Groq drops connection mid-stream, the SSE generator breaks silently. Frontend chat hangs forever showing a blinking cursor.

**Goal:**
- [ ] Wrap token iteration in try/except
- [ ] On error, yield `data: {"error": "Connection lost. Please retry."}` as final SSE event
- [ ] Frontend `ChatPanel.tsx` detects error events and shows inline retry button
- [ ] Save partial response to database even on error

**Files:** `apps/server/main/main.py`, `apps/web/src/components/ChatPanel.tsx`

### 4.2 Frontend Error Propagation from Polling
**Problem:** `data.error` from `/job/{id}/status` is returned by the backend but never extracted by the frontend polling loop.

**Goal:**
- [ ] In the polling callback, extract `data.error` and set it on `jobAError`/`jobBError` state
- [ ] `VideoCard` already accepts `errorMsg` prop — just need to wire the data through

**File:** `apps/web/src/app/session/[id]/page.tsx`

### 4.3 Next.js Error Boundaries
**Problem:** No `error.tsx`, `loading.tsx`, or `not-found.tsx` in any route. Unhandled errors crash to white screen.

**Goal:**
- [ ] Add `app/error.tsx` — global error boundary with retry button
- [ ] Add `app/loading.tsx` — global loading skeleton
- [ ] Add `app/not-found.tsx` — styled 404 page
- [ ] Add `app/session/[id]/error.tsx` — session-specific error handling

---

## Phase 5: Security Hardening
**Priority:** HIGH — Currently has zero authentication
**Estimated Scope:** 4 files modified, 2 new files

### 5.1 Cookie Security
**Problem:** Raw UUID stored in unsigned cookie. Anyone can forge a `userId` cookie and access another user's sessions.

**Goal:**
- [ ] Sign cookies using `httpOnly`, `secure`, `sameSite` flags via Next.js
- [ ] Implement proper session tokens (signed JWT or encrypted cookie)
- [ ] Validate session token on every server action

### 5.2 CORS Configuration
**Problem:** `allow_origins=["*"]` with `allow_credentials=True`.

**Goal:**
- [ ] Set specific origin: `allow_origins=[os.getenv("FRONTEND_URL", "http://localhost:3000")]`
- [ ] Keep `allow_credentials=True` only with specific origins

### 5.3 Input Validation
**Problem:** `/ingest` accepts any string as URL. Credits are decremented before URL validation.

**Goal:**
- [ ] Add URL format validation in Pydantic model (regex for supported platforms)
- [ ] Validate URL is a recognized platform before decrementing credits
- [ ] Add `session_id` UUID format validation

### 5.4 SQL Injection Hardening
**Problem:** `execute_raw(f"INSERT ... '{job_id}'::uuid ...")` uses f-string interpolation for chunk copy and pg_notify.

**Goal:**
- [ ] Use parameterized queries for chunk copy SQL
- [ ] Use parameterized queries for `pg_notify` calls
- [ ] Or remove `pg_notify` entirely since no LISTEN subscriber exists

---

## Phase 6: Pipeline Refactoring & Code Quality
**Priority:** MEDIUM — Reduces maintenance burden
**Estimated Scope:** 3 files modified, 1 new file

### 6.1 Unified Transcript Strategy Runner
**Problem:** 100+ lines of 6-tier fallback code duplicated between YouTube and Shorts branches in `ingest.py`.

**Goal:**
- [ ] Extract strategy cascade into a single function: `try_transcript_strategies(yt_id, cookie_path) -> str | None`
- [ ] Both YouTube and Shorts branches call the same function
- [ ] Reduce `ingest.py` by ~100 lines

### 6.2 Dead Code Cleanup
**Goal:**
- [ ] Remove `async_transcription_pipeline()` from `youtube.py` (L638-730) — legacy function
- [ ] Remove `page.module.css` — never imported
- [ ] Remove 16 `pg_notify` calls — no subscriber exists (or implement LISTEN)
- [ ] Remove `uuid` from `web/package.json` — never imported
- [ ] Remove `langgraph` from `requirements.txt` — never imported

### 6.3 Audio Memory Safety
**Problem:** HLS segments and direct audio downloads load entirely into RAM without size checks.

**Goal:**
- [ ] Check `Content-Length` header before downloading (reject >25MB)
- [ ] Stream HLS segments with running byte counter, abort if exceeding limit
- [ ] Log audio payload sizes for monitoring

---

## Phase 7: Frontend UI/UX Enhancement
**Priority:** MEDIUM — Improves user conversion and engagement
**Estimated Scope:** 6 files modified, 4 new files

### 7.1 Landing Page Intelligence
**Goal:**
- [ ] Live URL regex validation with platform badge (YouTube / TikTok / Instagram / X icon + color)
- [ ] "Try Demo" button that pre-fills two curated video URLs
- [ ] Animated platform support badges below the input fields
- [ ] Display remaining API credits for returning users

### 7.2 Real-Time Pipeline Telemetry
**Goal:**
- [ ] Add `sub_status` field to Job model (`EXTRACTING_METADATA | TRANSCRIBING | EMBEDDING | READY`)
- [ ] Worker updates sub_status at each pipeline stage
- [ ] ProcessingOverlay reads real sub_status from polling instead of fake timer
- [ ] Animated step-progress indicator with checkmarks for completed stages

### 7.3 Head-to-Head Comparison Visualization
**Goal:**
- [ ] Create a `ComparisonRibbon` component between Video A and Video B cards
- [ ] Show relative metric deltas: "+162% more views", "3.2× higher engagement"
- [ ] Color-coded advantage indicators (green for winner, neutral for close)

### 7.4 Chat UX Enhancements
**Goal:**
- [ ] Add 3-4 suggested prompt pills above the input: "Compare hooks", "Why did Video A get more comments?", "Script ideas combining both"
- [ ] Smart auto-scroll: pause when user scrolls up to read, resume when they scroll back down
- [ ] One-click copy button on each AI response
- [ ] Display "Sources: Video A Chunk 3, Video B Chunk 1" citation tags below AI responses

### 7.5 Responsive Design Audit
**Goal:**
- [ ] Test and fix all breakpoints below 1024px (currently the layout collapses vertically)
- [ ] Mobile-specific layout: tabs for Video Cards vs Chat instead of side-by-side
- [ ] Touch-friendly input sizing and button targets

### 7.6 Resizable Multi-Pane Studio Workbench
**Status:** ⏳ PENDING
**Goal:**
- [ ] Complete full drag-to-resize panel layout for `/session/[id]` across all screen resolutions
- [ ] Implement responsive drag handles between Inspector, Stage, and Copilot panes
- [ ] Ensure child containers (Inspector, Stage, Copilot) fluidly expand/contract without fixed width constraints
- [ ] Support double-click to collapse/expand side panels

---

## Phase 8: Observability & DevOps
**Priority:** MEDIUM — Required for production monitoring
**Estimated Scope:** 3 new files, 2 files modified

### 8.1 Monitoring & Metrics
**Goal:**
- [ ] Add request timing middleware (log response times per endpoint)
- [ ] Track ingestion success/failure rates
- [ ] Track external API call counts (Groq, Jina, YouTube) per day
- [ ] Expose metrics endpoint or integrate with Prometheus/Grafana

### 8.2 Error Alerting
**Goal:**
- [ ] Integrate with Sentry or similar error tracking for both frontend (Next.js) and backend (FastAPI)
- [ ] Alert on: job failure rate > 20%, API rate limit hits, OOM events

### 8.3 CI/CD Pipeline
**Goal:**
- [ ] GitHub Actions workflow: lint → type-check → build → deploy
- [ ] Separate workflows for frontend (Vercel) and backend (Docker push)
- [ ] Environment variable validation in CI

---

## Execution Priority Matrix

```
 IMPACT
   ▲
   │  Phase 1 (Connections)    Phase 2 (Rate Limits)
   │  ████████████████████     ████████████████████
   │  CRITICAL: Do First       CRITICAL: Do Second
   │
   │  Phase 3 (RAG Quality)    Phase 4 (Error UX)
   │  ████████████████████     ████████████████████
   │  HIGH: Do Third           HIGH: Do Fourth
   │
   │  Phase 5 (Security)       Phase 6 (Refactor)
   │  ████████████████████     ████████████████████
   │  HIGH: Do Fifth           MEDIUM: Do Sixth
   │
   │  Phase 7 (UI/UX)          Phase 8 (DevOps)
   │  ████████████████████     ████████████████████
   │  MEDIUM: Do Seventh       MEDIUM: Do Eighth
   │
   └────────────────────────────────────────────────► EFFORT
```

**Estimated Total Scope:** ~25 files modified/created across 8 phases.
