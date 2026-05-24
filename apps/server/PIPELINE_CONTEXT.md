# ReelMind Ingestion Pipeline Architecture

## 3 Pipelines

### Pipeline 1 — YouTube Transcript API (fast, free, no auth)
- Input: YouTube URL
- Extract video_id from URL
- Fetch metadata via Google YouTube Data API v3 (`statistics`, `snippet`, `contentDetails`)
- Fetch transcript via `youtube-transcript-api`
- Fallback: try English → try any language + translate → **fail → trigger Pipeline 2**
- Output: metadata dict + transcript string

### Pipeline 2 — yt-dlp + Groq Whisper (universal fallback, any platform)
- Input: Any video URL (YouTube fallback, Instagram, TikTok, etc.)
- Metadata: `yt-dlp --skip-download` extracts view_count, like_count, etc.
- Audio: `yt-dlp -f bestaudio` downloads audio → FFmpeg converts to mp3
- Transcription: Send audio to Groq Whisper API (`whisper-large-v3-turbo`)
- Auth: Uses `--cookies-from-browser chrome` for platforms requiring login
- Output: metadata dict + transcript string

### Pipeline 3 — Chunking + Embedding (runs after Pipeline 1 or 2)
- Input: transcript string + job record
- Chunk: `RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)`
- Embed: NVIDIA NIM `nvidia/llama-nemotron-embed-1b-v2` at 1024 dims
- Store: Raw SQL INSERT into Chunk table with `embedding::vector`
- Output: N chunks stored in pgvector

## Flow
```
URL → detect_platform()
  ├─ YouTube → Pipeline 1
  │    ├─ success → Pipeline 3
  │    └─ fail (private/deleted/no captions) → Pipeline 2 → Pipeline 3
  └─ Instagram/TikTok/Other → Pipeline 2 → Pipeline 3
```

## Cookie / Auth Strategy for yt-dlp
- Use `--cookies-from-browser chrome` (or firefox/edge) to auto-extract cookies
- This avoids manually exporting cookie files
- Works for YouTube (age-restricted), Instagram (login-wall), TikTok
- Requires the browser to be logged in on that machine

## DB Fields Written by Ingestion
Job: video_id, url, label, platform, title, creator, follower_count, duration,
     hashtags, upload_date, thumbnail_url, transcript, status, views, likes,
     comments, engagement_rate

Chunk: job_id, session_id, content, chunk_index, embedding (vector), metadata (json)

## Key Libraries
- `google-api-python-client` → YouTube Data API v3
- `youtube-transcript-api` → YouTube captions
- `yt-dlp` → universal video/audio download + metadata
- `groq` → Whisper transcription + Llama LLM
- `langchain-nvidia-ai-endpoints` → NVIDIA NIM embeddings
- `langchain-text-splitters` → chunking
