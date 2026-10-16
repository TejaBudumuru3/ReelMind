import os
import sys
import json
from contextlib import asynccontextmanager
from typing import Optional

if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if sys.stderr and hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')
from fastapi import FastAPI, Request, HTTPException, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, HttpUrl, field_validator
import re
from qstash import QStash, Receiver
from dotenv import load_dotenv
import asyncio
from fastapi.middleware.cors import CORSMiddleware
from worker.ingest import async_pipeline_link_to_text
from worker.downloader import extract_download_formats, get_direct_stream_info, stream_ytdlp_process
import httpx
from urllib.parse import quote, urlparse
from rag.retrieval_chain import stream_chat
from core.db import init_db, close_db, prisma_client as db
from core.logging import get_logger
from core.errors import sanitize_error
from core.config import ENABLE_MEDIA_DOWNLOADS
from core.limiter import limiter
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

load_dotenv()

logger = get_logger("main")

QSTASH_TOKEN = os.getenv('QSTASH_TOKEN')
QSTASH_URL = os.getenv('QSTASH_URL')
QSTASH_CURRENT_SIGNING_KEY = os.getenv('QSTASH_CURRENT_SIGNING_KEY')
QSTASH_NEXT_SIGNING_KEY = os.getenv('QSTASH_NEXT_SIGNING_KEY')

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing database pools...")
    await init_db()
    yield
    logger.info("Closing database pools...")
    await close_db()

app = FastAPI(lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

qstash_client = QStash(QSTASH_TOKEN, base_url=QSTASH_URL.rstrip('/') if QSTASH_URL else None)
receiver = Receiver(
    current_signing_key=QSTASH_CURRENT_SIGNING_KEY,
    next_signing_key=QSTASH_NEXT_SIGNING_KEY
)

class IngestPayload(BaseModel):
    url: str
    session_id: str
    label: str | None = None

    @field_validator('url')
    @classmethod
    def validate_supported_url(cls, v: str):
        url_str = v.strip()
        if not url_str.startswith('https://'):
            raise ValueError("Only secure HTTPS links (https://...) are supported.")
        parsed = urlparse(url_str)
        hostname = (parsed.hostname or '').lower()
        if not hostname or '.' not in hostname:
            raise ValueError("Invalid URL: missing valid domain name.")
        # Reject private/loopback/cloud metadata ranges
        if hostname in ['localhost', '127.0.0.1', '0.0.0.0', '169.254.169.254'] or hostname.endswith('.local') or hostname.endswith('.internal'):
            raise ValueError("Restricted address: internal or loopback destinations are not permitted.")
        return url_str

    @field_validator('session_id')
    @classmethod
    def validate_uuid(cls, v: str):
        uuid_pattern = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.IGNORECASE)
        if not uuid_pattern.match(v):
            raise ValueError("Invalid session ID format.")
        return v

class ChatPayload(BaseModel):
    session_id: str
    message:str
    focus_job_id: str | None = None

frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url],
    allow_methods=["*"],
    allow_credentials=True,
    allow_headers=["*"],
)

@app.get('/health')
async def health_check():
    return {"status": "ok", "db_connected": db.is_connected()}

@app.get('/video/formats')
@limiter.limit("30/minute")
async def get_video_formats(request: Request, url: str):
    if not ENABLE_MEDIA_DOWNLOADS:
        raise HTTPException(status_code=403, detail="Media downloading is disabled in this environment.")
    try:
        data = extract_download_formats(url)
        return data
    except Exception as e:
        logger.error(f"Error extracting formats for {url}: {e}", exc_info=True)
        sanitized = sanitize_error(e)
        raise HTTPException(status_code=400, detail=sanitized)

@app.get('/video/download')
@limiter.limit("20/minute")
async def download_video_stream(
    request: Request,
    url: str,
    format_id: str,
    ext: Optional[str] = None,
    title: Optional[str] = None
):
    if not ENABLE_MEDIA_DOWNLOADS:
        raise HTTPException(status_code=403, detail="Media downloading is disabled in this environment.")
    try:
        chosen_ext = ext or "mp4"
        raw_title = title
        if not raw_title:
            try:
                stream_info = get_direct_stream_info(url, format_id)
                chosen_ext = stream_info.get('ext') or chosen_ext
                raw_title = stream_info.get('title')
            except Exception as e:
                logger.warning(f"Failed to fetch stream info for title, using fallback: {e}")
                raw_title = "reelmind_download"

        safe_title = re.sub(r'[^a-zA-Z0-9_\- ]+', '', raw_title or "reelmind_download").strip()[:60] or "reelmind_download"
        filename = f"{safe_title}.{chosen_ext}"

        encoded_filename = quote(filename)
        headers = {
            "Content-Disposition": f'attachment; filename="{encoded_filename}"; filename*=UTF-8\'\'{encoded_filename}',
            "Accept-Ranges": "bytes"
        }

        if chosen_ext in ["m4a", "aac", "mp3"]:
            media_type = "audio/mp4"
        elif chosen_ext in ["opus", "ogg"]:
            media_type = "audio/ogg"
        elif chosen_ext == "webm":
            media_type = "video/webm"
        else:
            media_type = "video/mp4"

        return StreamingResponse(stream_ytdlp_process(url, format_id), media_type=media_type, headers=headers)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to stream format {format_id} for {url}: {e}", exc_info=True)
        sanitized = sanitize_error(e)
        raise HTTPException(status_code=500, detail=sanitized)


@app.post('/ingest/download')
@limiter.limit("30/minute")
async def ingest_download_only(request: Request, payload: IngestPayload):
    """
    Ingests video strictly for browser downloading.
    Bypasses transcription pipeline, LLMs, and duration constraints.
    """
    if not ENABLE_MEDIA_DOWNLOADS:
        raise HTTPException(status_code=403, detail="Media downloading is disabled in this environment.")
    try:
        session = await db.session.find_unique(
            where={"id": payload.session_id},
            include={"user": True}
        )
        if not session or not session.user:
            raise HTTPException(status_code=404, detail="Session not found")

        label = payload.label
        if not label:
            count = await db.job.count(where={"session_id": payload.session_id})
            label = chr(65 + count)

        # Probe metadata without downloading or checking duration constraints
        meta = await asyncio.to_thread(extract_download_formats, payload.url)
        title = meta.get('title') or "Media Stream"
        thumbnail = meta.get('thumbnail')
        duration = meta.get('duration') or 0

        job = await db.job.create(
            data={
                "session_id": payload.session_id,
                "status": "COMPLETED",
                "sub_status": "READY",
                "url": payload.url,
                "title": title,
                "thumbnail_url": thumbnail,
                "duration": int(duration) if duration else 0,
                "label": label,
                "transcript": None
            }
        )

        return {
            "status": "COMPLETED",
            "job_id": job.id,
            "session_id": payload.session_id,
            "title": title
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to ingest download-only URL {payload.url}: {e}", exc_info=True)
        sanitized = sanitize_error(e)
        raise HTTPException(status_code=500, detail=sanitized)


@app.post('/ingest')
@limiter.limit("10/day")
async def ingest_url(request: Request, payload: IngestPayload):

    worker_url = os.getenv('WORKER_URL', 'http://localhost:8000/worker')
    user_id = ""
    try:

        session = await db.session.find_unique(
            where={"id": payload.session_id},
            include={"user": True}
        )
        if not session or not session.user:
            raise HTTPException(status_code=404, detail="Session not found")
        user_id = session.user.id
        if session.user.api_credits <= 0:
            raise HTTPException(status_code=403, detail="No API credits remaining")
        
        await db.user.update(
            where={"id": session.user.id},
            data={"api_credits": {"decrement": 1}}
        )

        label = payload.label
        if not label:
            count = await db.job.count(
                where={ "session_id": payload.session_id}
            )
            label = chr(65 + count)
            
        # Clean up failed jobs to accommodate retries and maintain max 2 jobs per session
        await db.job.delete_many(
            where={
                "session_id": payload.session_id,
                "status": "FAILED"
            }
        )
        
        active_count = await db.job.count(
            where={
                "session_id": payload.session_id
            }
        )
        if active_count >= 2:
            raise HTTPException(status_code=400, detail="This session already has 2 active videos. Please start a new session.")

        job = await db.job.create(
            data={
                "session_id": payload.session_id,
                "status": "PENDING",
                "url": payload.url,
                "label": label
            }
        )


        res = qstash_client.message.publish_json(
            url=worker_url,
            body={
                'url': payload.url,
                'job_id': job.id
            },
            retries=3,
            delay=1,
            timeout="5m"
        )

        return {
            "status": "Queued", 
            "job_id": job.id, 
            "message_id": res.message_id
        }
    except HTTPException:
        raise
    except Exception as e:
        if user_id:
            await db.user.update(
                where={"id": user_id},
                data={"api_credits": {"increment": 1}}
            )
        logger.error(f"Failed to ingest URL: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/worker")
async def worker(req: Request):
    signature = req.headers.get("Upstash-Signature")
    if signature is None:
        raise HTTPException(status_code=401, detail="Invalid")

    raw_body = await req.body()

    try:
        # If this fails, it throws an Exception and rejects the request
        receiver.verify(
            body=raw_body.decode("utf-8"),
            signature=signature,
            # We omit the 'url' parameter here for easier local testing
        )
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid QStash Signature")

    # Signature is valid. Unpack the JSON and do the heavy lifting.
    data = json.loads(raw_body)
    job_id = data.get("job_id")
    video_url = data.get("url")
    
    logger.info(f"Webhook verified! Starting heavy extraction for {video_url}", extra={"job_id": job_id})

    try:

        await async_pipeline_link_to_text(job_id, video_url)

        logger.info("Pipeline completed. Returning 200 OK to QStash.", extra={"job_id": job_id})

        return Response(status_code=200)
    
    except Exception as e:
        logger.error(f"Critical Worker Error: {e}", exc_info=True, extra={"job_id": job_id})
        
        try:
            current = await db.job.find_unique(where={"id": job_id})
            if current and current.status not in ['COMPLETED', 'FAILED']:
                await db.job.update(
                    where={ "id": job_id },
                    data={ "status": "FAILED", "error_message": sanitize_error(e) }
                )
            else:
                logger.info(f"Skipping — job already {current.status if current else 'missing'}", extra={"job_id": job_id})
        except Exception as inner_e:
            logger.error(f"Database update failed during error handling: {inner_e}", exc_info=True)
        
        # Return 200 so QStash does NOT retry (we already handled the error)
        return Response(status_code=200)
        

@app.get('/job/{job_id}/status')
async def get_job_status(job_id: str):
    job = await db.job.find_unique(where={"id": job_id})
    if not job:
        return {"status": "NOT_FOUND"}
    
    res = {"status": job.status, "sub_status": job.sub_status, "error": job.error_message}
    if job.status == "COMPLETED":
        res["job_data"] = {
            "label": job.label,
            "creator": job.creator,
            "title": job.title,
            "platform": job.platform,
            "thumbnail_url": job.thumbnail_url,
            "url": job.url,
            "views": int(job.views) if job.views else 0,
            "likes": int(job.likes) if job.likes else 0,
            "comments": int(job.comments) if job.comments else 0,
            "engagement_rate": float(job.engagement_rate) if job.engagement_rate else 0.0,
            "follower_count": int(job.follower_count) if job.follower_count else 0,
            "duration": job.duration,
            "transcript": job.transcript,
            "error_message": job.error_message
        }
    return res
@app.get('/chat/{session_id}')
async def get_chat_messages(session_id: str):
    try:
        messages = await db.message.find_many(
            where={"session_id": session_id},
            order={"created_at": "asc"},
            take=50
        )
        return {"messages": [{"id": msg.id, "role": msg.role, "content": msg.content, "created_at": msg.created_at.isoformat() if msg.created_at else None} for msg in messages]}
    except Exception as e:
        logger.error(f"Error fetching chat history: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch chat history")

@app.post('/chat')
@limiter.limit("60/hour")
async def chat_endpoint(request: Request, payload: ChatPayload):

    try:
        await db.message.create(
            data={
                "session_id": payload.session_id,
                "content": payload.message,
                "role": "USER"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    async def event_generator():
        full_response = ""
        try:
            async for token in stream_chat(payload.message, payload.session_id, payload.focus_job_id):
                if token:
                    full_response += token
                    yield f"data: {json.dumps({'text': token})}\n\n"
        except Exception as e:
            logger.error(f"Error during SSE stream: {e}", exc_info=True)
            error_msg = "\n\n**System Error:** The chat stream was unexpectedly interrupted."
            full_response += error_msg
            yield f"data: {json.dumps({'text': error_msg})}\n\n"
        finally:
            if full_response:
                try:
                    await db.message.create(
                        data={
                            "session_id": payload.session_id,
                            "role": "AI",
                            "content": full_response
                        }
                    )
                except Exception as db_e:
                    logger.error(f"Failed to save AI message to DB: {db_e}", exc_info=True)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream"
    )   