# ReelMind

**Talk to Video — Voice & Semantic Knowledge Intelligence Engine**

ReelMind is an AI-powered semantic intelligence workspace that turns spoken-word video content (lectures, tutorials, podcasts, keynotes, and interviews) into interactive, conversational knowledge graphs. Paste any video URL (or compare two videos side-by-side), and ReelMind extracts the spoken voice track, indexes the transcript into high-dimensional vector embeddings, and provides a low-latency conversational AI copilot grounded directly in the speaker's ideas.

Built as a high-performance monorepo with a **Next.js 16** frontend and a **FastAPI** backend, hardened for **$0.00 zero-cost production deployment** on GCP Cloud Run and Vercel.

---

## What It Does

1. **Submit Video Sources:** Paste a single video URL or compare two videos side-by-side (YouTube, Instagram Reels, TikTok, X, or any direct media stream supported by `yt-dlp`).
2. **Asynchronous Ingestion Queue:** The API verifies user credits, records a `PENDING` job in PostgreSQL, and dispatches the job to Upstash QStash for decoupled, fault-tolerant background execution.
3. **Multi-Strategy Speech Extraction:**
   - **YouTube Golden Path:** Fetches official metadata via YouTube Data API v3 and resolves transcripts through a 6-stage fallback cascade (`youtube-transcript-api` with session cookies + residential proxy, InnerTube watch page HTML scraping, `yt-dlp` caption extraction, public Invidious APIs, and Groq Whisper audio fallback).
   - **Universal Multi-Platform Path:** Routes generic platforms through `yt-dlp` with TLS browser impersonation (`curl-cffi`) and transcribes the audio stream with **Groq Whisper Large v3**.
4. **Speech Validation & Domain Boundaries:** Gracefully validates that the media contains human speech dialogue. If an input is a silent cartoon or instrumental music, the engine notifies the user rather than corrupting vector graphs with empty tokens.
5. **Vector Indexing (pgvector + Jina):** Recursive character splitting (500-char chunks, 50 overlap) embedded via **Jina Embeddings v3** (1024-dimensional vectors) and bulk-inserted into PostgreSQL via raw `asyncpg`.
6. **Conversational RAG (Retrieval-Augmented Generation):** Chat in real time with high-speed reasoning models (**Qwen 2.5/3.8 27B** via Groq). User queries are vectorized, matched using pgvector cosine distance (`<=>`), and streamed token-by-token over Server-Sent Events (SSE).

---

## Architectural Hardening & Recent Updates

Recent engineering improvements implemented to harden the system for production stability and zero infrastructure cost:

* **Zero-Cost Production Hardening (`ENABLE_MEDIA_DOWNLOADS`):**
  - Feature-flagged binary media downloading and HLS stream stitching to eliminate server-side egress bandwidth. Guarantees **$0.00 bills** on Google Cloud Run Free Tier while keeping the full download suite active for local development.
* **Regional Upstash QStash Cluster Support:**
  - Configured custom `base_url` handling in the FastAPI backend to support regional QStash endpoints (e.g., `https://qstash-eu-central-1.upstash.io/`), eliminating 401 signature verification mismatches.
* **Windows UTF-8 Encoding Resilience:**
  - Reconfigured standard I/O streams to UTF-8 and replaced raw stdout prints with structured logging. Resolves Windows `cp1252` `UnicodeEncodeError` crashes on non-ASCII video titles that previously stalled webhook workers in `PENDING` states.
* **Payload Size Ceiling Protection (Groq 413 Defense):**
  - Added proactive 25 MB payload threshold checks on audio downloads before dispatching to Groq Whisper, preventing `HTTP 413 Request Entity Too Large` crashes.
* **Residential Proxy Failover Integration:**
  - Configured intelligent fallback routing through Webshare residential proxies using direct IP:port authentication, bypassing datacenter IP bot detection on cloud servers without requiring static IP NAT infrastructure.
* **Sanitized Error Translation Layer:**
  - Low-level network, proxy (407), quota (429), and authentication errors are converted into polished, user-friendly feedback in the UI.

---

## Tech Stack

### Frontend (`apps/web`)

| Technology | Purpose |
|---|---|
| **Next.js 16** (App Router) | React Server Components, server actions, route handlers |
| **React 19** | Component architecture and state management |
| **TypeScript** | Strict compile-time type safety |
| **Tailwind CSS** | Design system and sleek dark-mode aesthetics |
| **Framer Motion** | Workspace transitions, drawer animations, and loading states |
| **Lucide React** | Clean, minimalist UI iconography |
| **React Markdown** | Rendering formatted AI responses with code highlighting |
| **Prisma Client (JS)** | Database client for server actions (sessions, history, user credits) |

### Backend (`apps/server`)

| Technology | Purpose |
|---|---|
| **FastAPI** | High-performance asynchronous REST API |
| **Uvicorn** | ASGI production server |
| **QStash (Upstash)** | Distributed serverless message queue for asynchronous job execution |
| **yt-dlp** | Video metadata and audio stream resolution across 1,800+ sites |
| **curl-cffi** | TLS/JA3 browser fingerprint impersonation for anti-bot bypass |
| **Google API Client** | YouTube Data API v3 for high-speed metadata and metrics |
| **youtube-transcript-api** | Direct YouTube subtitle extraction with proxy & cookie support |
| **Groq SDK** | Sub-second inference for Whisper Large v3 (ASR) and Qwen 27B / Llama LLMs |
| **Jina Embeddings v3** | 1024-dimensional dense vector embeddings |
| **asyncpg** | High-throughput asynchronous PostgreSQL client for pgvector cosine search |
| **Prisma Client (Python)** | Data modeling and schema synchronization with the TypeScript frontend |
| **SlowAPI** | Rate limiting protection on public ingestion and download endpoints |
| **Tenacity** | Exponential backoff retry policies for external network calls |

### Database & Storage (`packages/db`)

| Technology | Purpose |
|---|---|
| **PostgreSQL (Neon)** | Serverless Postgres database |
| **pgvector** | Vector similarity search using the cosine distance operator (`<=>`) |
| **Prisma Schema** | Single source of truth generating both TypeScript and Python ORM clients |

---

## Project Structure

```
ReelMind/
├── apps/
│   ├── web/                         # Next.js 16 frontend
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── page.tsx         # Landing page — Talk to Video ingestion hub
│   │   │   │   ├── actions.ts       # Server actions (sessions, users, history)
│   │   │   │   ├── session/[id]/    # Workspace — video player, metrics & AI copilot
│   │   │   │   └── history/         # Past session history
│   │   │   ├── components/
│   │   │   │   ├── ChatPanel.tsx    # Streaming chat with RAG context
│   │   │   │   └── VideoCard.tsx    # Video metadata and status cards
│   │   │   └── lib/
│   │   │       └── api.ts           # API client and JWT handling
│   │   └── package.json
│   │
│   └── server/                      # FastAPI backend
│       ├── main/
│       │   └── main.py              # API routes (/ingest, /worker, /chat, /video/download)
│       ├── worker/
│       │   ├── ingest.py            # Primary ingestion pipeline and Whisper audio extraction
│       │   ├── youtube.py           # YouTube multi-strategy transcript cascade
│       │   └── embeddings.py        # Recursive text chunking and Jina vector generation
│       ├── rag/
│       │   ├── retrieval.py         # pgvector similarity search via asyncpg
│       │   └── retrieval_chain.py   # LangChain conversational RAG orchestration
│       ├── core/
│       │   ├── config.py            # Environment configuration and feature flags
│       │   ├── errors.py            # User-friendly error sanitization
│       │   └── logging.py           # Structured JSON/console logging
│       └── requirements.txt
│
├── packages/
│   └── db/                          # Shared database schema
│       └── prisma/
│           └── schema.prisma        # Schema (User, Session, Job, Message, Chunk)
│
├── Dockerfile                       # Backend container definition
└── .vercelignore                    # Excludes backend code from Vercel deployments
```

---

## Database Schema

All entities are linked via UUIDs:

* **User:** Account credentials, Google OAuth profile, and remaining API credits.
* **Session:** Groups workspace jobs and chat messages together (supports single or comparison mode).
* **Job:** Tracks URL, platform, metadata, duration, transcript text, status (`PENDING` $\rightarrow$ `PROCESSING` $\rightarrow$ `COMPLETED`/`FAILED`), and sub-status (`EXTRACTING_METADATA`, `TRANSCRIBING`, `EMBEDDING`, `READY`).
* **Message:** Chat history between `USER` and `AI` with streaming support.
* **Chunk:** Segmented transcript blocks with `vector(1024)` embeddings, linked to both `Job` and `Session` for scoped similarity queries.

---

## Environment Variables

### Backend (`apps/server/.env` & Cloud Run)

```env
# Database
DATABASE_URL="postgresql://user:password@host:5432/neondb?sslmode=require"

# Message Queue (QStash)
QSTASH_URL="https://qstash-eu-central-1.upstash.io"
QSTASH_TOKEN="your_qstash_token"
QSTASH_CURRENT_SIGNING_KEY="sig_..."
QSTASH_NEXT_SIGNING_KEY="sig_..."
WORKER_URL="https://your-cloud-run-service.run.app/worker"

# AI Inference & Embeddings
GROQ_API="gsk_..."
GROQ_CHAT_MODEL="qwen/qwen3.8-27b"
GROQ_WHISPER_MODEL="whisper-large-v3"
GROQ_TRANSLATION_MODEL="openai/gpt-oss-20b"
JINA_API="jina_..."
EMBEDDING_MODEL="jina-embeddings-v3"
EMBEDDING_DIMENSION="1024"

# External APIs & Scraping
YOUTUBE_API="AIzaSy..."
FRONTEND_URL="https://your-vercel-domain.app"

# Cost & Feature Controls
ENABLE_MEDIA_DOWNLOADS="false"       # Set to "false" in Cloud Run, "true" locally

# Optional Proxy & Authentication
RESIDENTIAL_PROXY_URL="http://user:pass@host:port/"
COOKIES="base64_encoded_netscape_cookies"
```

### Frontend (`apps/web/.env.local` & Vercel)

```env
DATABASE_URL="postgresql://user:password@host:5432/neondb?sslmode=require"
NEXT_PUBLIC_API_URL="https://your-cloud-run-service.run.app"
NEXT_PUBLIC_ENABLE_DOWNLOADS="false"  # Set to "false" in Vercel, "true" locally
NEXT_PUBLIC_AI_MODEL_NAME="Qwen 3.8 27b Reasoning"

# Auth
CLIENT_ID="your_google_client_id.apps.googleusercontent.com"
CLIENT_KEY="GOCSPX-..."
GOOGLE_REDIRECT_URL="https://your-vercel-domain.app/api/auth/callback/google"
JWT_SECRET="your_secret_key"
```

---

## Local Development

### Prerequisites

* Node.js 18+
* Python 3.11+
* PostgreSQL with the `vector` extension enabled

### 1. Installation

```bash
git clone https://github.com/TejaBudumuru3/ReelMind.git
cd ReelMind

# Install database dependencies
cd packages/db && npm install && cd ../..

# Install frontend dependencies
cd apps/web && npm install && cd ../..

# Setup backend environment
cd apps/server
python -m venv .venv
source .venv/bin/activate    # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cd ../..
```

### 2. Database Synchronization

```bash
cd packages/db
npm run db:push
npm run generate

# Generate Python client
cd ../../apps/server
prisma generate --schema=../../packages/db/prisma/schema.prisma
cd ../..
```

### 3. Running Locally

**Terminal 1 (Backend):**
```bash
cd apps/server
python -m uvicorn main.main:app --reload --port 8000
```

**Terminal 2 (Frontend):**
```bash
cd apps/web
npm run dev
```

Open `http://localhost:3000` in your browser.

---

## Live Interview Demonstration Playbook

To ensure reliable, instantaneous results during live technical interviews:

1. **Recommended Demo Links (Spoken Voice):**
   * **Instant Tech Talk:** `https://www.youtube.com/watch?v=tFb45gnuhII` (Pre-indexed, 27 vector chunks, immediate response).
   * **19-Second Fast Ingestion:** `https://www.youtube.com/watch?v=jNQXAC9IVRw` ("Me at the zoo" — extracts and embeds in ~2 seconds).
2. **Domain Boundary Demonstrations:**
   * If asked how the system handles non-speech media (e.g., instrumental music or silent animation like *Big Buck Bunny*), explain that ReelMind validates speech detection at the Whisper inference layer and gracefully rejects speech-empty media before vectorization to maintain high vector graph fidelity.

---

## License

This project is proprietary. All rights reserved.
