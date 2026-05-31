# ReelMind

AI-powered video analytics tool that lets creators compare social media videos side by side. Paste two video URLs, and ReelMind pulls metadata, transcribes the audio, builds vector embeddings from the transcript, and gives you a conversational AI chat interface to ask questions about engagement, hooks, content strategy — whatever you need.

Built as a monorepo with a Next.js frontend and a FastAPI backend.

---

## What it does

1. You paste up to two video URLs (Instagram, TikTok, X — anything yt-dlp supports)
2. The backend queues a job via QStash and starts the ingestion pipeline
3. yt-dlp extracts metadata and audio, then Groq's Whisper Large v3 transcribes it
4. Transcripts get chunked and embedded using Jina Embeddings v3 (1024-dim vectors), stored in Postgres via pgvector
5. You chat with the AI (Llama 3.3 70B via Groq) about the videos — it uses RAG to pull relevant transcript chunks and combines them with video metadata for data-driven answers
6. Responses stream back token-by-token via SSE

---

## Tech Stack

### Frontend (`apps/web`)

| Tech | What it's used for |
|---|---|
| **Next.js 16** (App Router) | Framework, SSR, server actions |
| **React 19** | UI components |
| **TypeScript** | Type safety |
| **Framer Motion** | Page transitions, loading animations |
| **Lucide React** | Icons |
| **React Markdown** | Rendering AI chat responses |
| **Prisma Client (JS)** | Server-side DB queries (session/user creation, history) |
| **Outfit** (Google Fonts) | Typography |

### Backend (`apps/server`)

| Tech | What it's used for |
|---|---|
| **FastAPI** | REST API server |
| **Uvicorn** | ASGI server |
| **Pydantic** | Request/response validation |
| **QStash** (Upstash) | Message queue — decouples ingestion from the API, handles retries |
| **yt-dlp** | Video metadata + audio extraction for non-YouTube platforms |
| **Google API Client** | YouTube Data API v3 for stats and metadata |
| **youtube-transcript-api** | YouTube transcript extraction (with proxy + cookie support) |
| **Groq SDK** | Whisper Large v3 audio transcription + Llama 3.3 70B for translation |
| **LangChain + LangChain-Groq** | LLM orchestration, prompt templates, streaming |
| **LangChain Text Splitters** | Recursive chunking (500 chars, 50 overlap) |
| **Jina Embeddings v3** (via LangChain Community) | 1024-dim vector embeddings for transcript chunks |
| **Prisma Client (Python)** | ORM for job/session/chunk management |
| **asyncpg** | Raw async Postgres queries for vector similarity search and bulk inserts |
| **httpx** | Async HTTP client for downloading audio streams |
| **isodate** | Parsing ISO 8601 durations from YouTube API |

### Database (`packages/db`)

| Tech | What it's used for |
|---|---|
| **PostgreSQL** | Primary database |
| **pgvector** extension | Vector similarity search (`<=>` cosine distance) |
| **Prisma** (shared schema) | Schema definition, migrations, client generation for both TS and Python |

### Infrastructure

| Tech | What it's used for |
|---|---|
| **Docker** | Containerized backend deployment |
| **Vercel** | Frontend hosting (`.vercelignore` excludes the server) |
| **QStash** (Upstash) | Serverless message queue with webhook verification |

---

## Project Structure

```
ReelMind/
├── apps/
│   ├── web/                    # Next.js frontend
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── page.tsx            # Landing page — paste video URLs
│   │   │   │   ├── actions.ts          # Server actions (create session, get history)
│   │   │   │   ├── session/[id]/       # Session page — video cards + AI chat
│   │   │   │   └── history/            # Past analysis sessions
│   │   │   ├── components/
│   │   │   │   ├── VideoCard.tsx       # Video metadata display with metrics
│   │   │   │   ├── ChatPanel.tsx       # Streaming AI chat with markdown
│   │   │   │   └── ProcessingOverlay.tsx  # Animated loading states
│   │   │   └── lib/
│   │   │       └── api.ts              # API client for backend calls
│   │   └── package.json
│   │
│   └── server/                 # FastAPI backend
│       ├── main/
│       │   └── main.py                 # API routes (ingest, worker, chat, job status)
│       ├── worker/
│       │   ├── ingest.py               # Full ingestion pipeline (metadata + transcript + embed)
│       │   ├── youtube.py              # YouTube-specific extraction with 6 fallback strategies
│       │   └── embeddings.py           # Text chunking + Jina embedding + pgvector storage
│       ├── rag/
│       │   ├── retrieval.py            # Vector similarity search via asyncpg
│       │   └── retrieval_chain.py      # LangChain RAG chain with Llama 3.3
│       └── requirements.txt
│
├── packages/
│   └── db/
│       └── prisma/
│           └── schema.prisma           # Shared schema (User, Session, Job, Message, Chunk)
│
├── Dockerfile                  # Backend container
└── .vercelignore               # Excludes server from Vercel builds
```

---

## How the Pipeline Works

The ingestion pipeline is the core of the project. Here's what happens when you submit a video URL:

**YouTube path:**
1. Extract video ID from the URL (handles regular, Shorts, youtu.be, mobile links)
2. Hit YouTube Data API v3 for views, likes, comments, duration, thumbnail, channel info
3. Calculate engagement rate: `(likes + comments) / views × 100`
4. Try to get the transcript through a cascade of 6 strategies:
   - `youtube-transcript-api` with cookies + proxy
   - `youtube-transcript-api` via residential proxy only
   - Innertube (scrape `ytInitialPlayerResponse` from watch page HTML)
   - `yt-dlp` caption track extractions
   - Public Invidious API instances
   - Full audio download → Whisper transcription (last resort)
5. If transcript is in a non-English language, translate via YouTube's API or Groq Llama 3.3
6. Cache check — if the same video was already processed, copy metadata and chunks instead of re-processing

**Non-YouTube path (Instagram, TikTok, X, etc):**
1. yt-dlp extracts metadata and audio stream URL
2. Download audio into memory (handles both direct URLs and HLS/m3u8 streams)
3. Send audio to Groq Whisper Large v3 for transcription
4. Same embedding pipeline as YouTube

**Embedding step (shared):**
1. Split transcript using `RecursiveCharacterTextSplitter` (500 char chunks, 50 overlap)
2. Generate 1024-dim vectors using Jina Embeddings v3
3. Bulk insert into `Chunk` table with `vector(1024)` column via raw `asyncpg`

**RAG chat:**
1. Embed the user's question with Jina
2. Cosine similarity search against session chunks (`<=>` operator in pgvector)
3. Build system prompt with video metadata + top-5 relevant transcript chunks
4. Stream response from Llama 3.3 70B via LangChain, token-by-token over SSE

---

## Database Schema

Five tables, all linked by UUIDs:

- **User** — email, API credits (starts at 10, decremented per ingestion)
- **Session** — belongs to a user, groups videos + messages together
- **Job** — one per video. Stores URL, platform, all stats, transcript, status (PENDING → PROCESSING → COMPLETED/FAILED)
- **Message** — chat history (USER or AI role)
- **Chunk** — transcript segments with `vector(1024)` embeddings, linked to both Job and Session

---

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.11+
- PostgreSQL with the `vector` extension enabled

### 1. Clone and install

```bash
git clone https://github.com/your-username/ReelMind.git
cd ReelMind
```

**Database package:**
```bash
cd packages/db
npm install
```

**Frontend:**
```bash
cd apps/web
npm install
```

**Backend:**
```bash
cd apps/server
python -m venv .venv
source .venv/bin/activate    # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Environment variables

**`apps/server/.env`**

```env
DATABASE_URL=postgresql://user:password@host:5432/dbname

# QStash (Upstash) — for job queue
QSTASH_URL=https://qstash.upstash.io
QSTASH_TOKEN=your_qstash_token
QSTASH_CURRENT_SIGNING_KEY=your_current_key
QSTASH_NEXT_SIGNING_KEY=your_next_key

# YouTube Data API v3
YOUTUBE_API=your_youtube_api_key

# Groq — for Whisper transcription + Llama LLM
GROQ_API=your_groq_api_key

# Jina — for embeddings
JINA_API=your_jina_api_key

# Optional: residential proxy for YouTube transcript fetching
RESIDENTIAL_PROXY_URL=http://user:pass@proxy:port

# Optional: YouTube cookies (base64-encoded Netscape format)
COOKIES=base64_encoded_cookie_string
```

**`apps/web/.env.local`**

```env
DATABASE_URL=postgresql://user:password@host:5432/dbname
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### 3. Set up the database

```bash
cd packages/db
npm run db:push
npm run generate
```

This pushes the Prisma schema to your Postgres instance and generates both the TypeScript and Python clients.

### 4. Generate Prisma Python client

```bash
cd apps/server
prisma generate --schema=../../packages/db/prisma/schema.prisma
```

### 5. Run it

**Backend:**
```bash
cd apps/server
python -m uvicorn main.main:app --reload --port 8000
```

**Frontend:**
```bash
cd apps/web
npm run dev
```

Open `http://localhost:3000`, paste some video URLs, and start analyzing.

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/ingest` | Submit a video URL for processing. Returns job ID. |
| `POST` | `/worker` | QStash webhook — verified with signature. Runs the ingestion pipeline. |
| `GET` | `/job/{job_id}/status` | Poll job status. Returns metadata when completed. |
| `POST` | `/chat` | Send a message. Returns SSE stream of AI tokens. |

---

## Docker (Backend)

```bash
docker build -t reelmind-server .
docker run -p 8000:8000 --env-file apps/server/.env reelmind-server
```

The Dockerfile builds a Python 3.11 slim image, installs dependencies, fixes the Prisma provider path for non-venv environments, generates the Python client, and runs Uvicorn.

---

## Credits & API Keys You'll Need

| Service | What for | Free tier? |
|---|---|---|
| [Groq](https://console.groq.com) | Whisper transcription + Llama 3.3 70B | Yes |
| [Jina AI](https://jina.ai) | Jina Embeddings v3 | Yes |
| [YouTube Data API](https://console.cloud.google.com) | Video metadata/stats | Yes (10k quota/day) |
| [Upstash QStash](https://upstash.com) | Message queue | Yes |
| PostgreSQL + pgvector | Database | Neon/Supabase free tiers work |

---

## License

This project is not currently licensed. All rights reserved.
