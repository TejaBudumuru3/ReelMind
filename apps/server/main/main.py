import os
import json
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, HTTPException, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, HttpUrl, field_validator
import re
from qstash import QStash, Receiver
from dotenv import load_dotenv
import asyncio
from fastapi.middleware.cors import CORSMiddleware
from worker.ingest import async_pipeline_link_to_text
from rag.retrieval_chain import stream_chat
from core.db import init_db, close_db, prisma_client as db
from core.logging import get_logger
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

qstash_client = QStash(QSTASH_TOKEN)
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
        platform_pattern = re.compile(r'youtube\.com|youtu\.be|tiktok\.com|instagram\.com|x\.com|twitter\.com', re.IGNORECASE)
        if not platform_pattern.search(v):
            raise ValueError("Unsupported platform. Please provide a link from YouTube, TikTok, Instagram, or X.")
        return v

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
    
    print(f"🔥 Webhook verified! Starting heavy extraction for {video_url}")

    try:

        await async_pipeline_link_to_text(job_id, video_url)

        print("Pipeline completed. Returning 200 OK to QStash.")

        return Response(status_code=200)
    
    except Exception as e:
        logger.error(f"Critical Worker Error: {e}", exc_info=True, extra={"job_id": job_id})
        
        try:
            current = await db.job.find_unique(where={"id": job_id})
            if current and current.status not in ['COMPLETED', 'FAILED']:
                await db.job.update(
                    where={ "id": job_id },
                    data={ "status": "FAILED", "error_message": str(e) }
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