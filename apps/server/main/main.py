import os
import json
from fastapi import FastAPI, Request, HTTPException, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from qstash import QStash, Receiver
from dotenv import load_dotenv
from prisma_db import Prisma
import asyncio
from fastapi.middleware.cors import CORSMiddleware
from worker.ingest import async_pipeline_link_to_text
from rag.retrieval_chain import stream_chat

load_dotenv()

QSTASH_TOKEN = os.getenv('QSTASH_TOKEN')
QSTASH_URL = os.getenv('QSTASH_URL')
QSTASH_CURRENT_SIGNING_KEY = os.getenv('QSTASH_CURRENT_SIGNING_KEY')
QSTASH_NEXT_SIGNING_KEY = os.getenv('QSTASH_NEXT_SIGNING_KEY')

app = FastAPI()

qstash_client = QStash(QSTASH_TOKEN)
receiver = Receiver(
    current_signing_key=QSTASH_CURRENT_SIGNING_KEY,
    next_signing_key=QSTASH_NEXT_SIGNING_KEY
)

class IngestPayload(BaseModel):
    url: str
    session_id: str
    label: str = None

class ChatPayload(BaseModel):
    session_id: str
    message:str

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post('/ingest')
async def ingest_url(payload: IngestPayload):
    db = Prisma()
    await db.connect()


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
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        await db.disconnect()

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
        print(f"❌ Critical Error: {e}")
        
        db = Prisma()
        await db.connect()
        try:
            current = await db.job.find_unique(where={"id": job_id})
            if current and current.status not in ['COMPLETED', 'FAILED']:
                await db.job.update(
                    where={ "id": job_id },
                    data={ "status": "FAILED", "error_message": str(e) }
                )
                await db.execute_raw(f"SELECT pg_notify('job_updates', '{job_id}')")
            else:
                print(f"⏭️ Skipping — job already {current.status if current else 'missing'}")
        except Exception as e:
            print(f"Database connection failed: {e}")
        finally:
            await db.disconnect()
        
        # Return 200 so QStash does NOT retry (we already handled the error)
        return Response(status_code=200)
        

@app.get('/job/{job_id}/status')
async def get_job_status(job_id: str):
    db = Prisma()
    await db.connect()
    try:
        job = await db.job.find_unique(where={"id": job_id})
        if not job:
            return {"status": "NOT_FOUND"}
        
        res = {"status": job.status, "error": job.error_message}
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
            }
        return res
    finally:
        await db.disconnect()

@app.post('/chat')
async def chat_endpoint(payload: ChatPayload):
    db = Prisma()
    await db.connect()

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
            async for token in stream_chat(payload.message, payload.session_id):
                if token:
                    full_response += token
                    yield f"data: {json.dumps({'text': token})}\n\n"
        finally:
            if full_response:
                await db.message.create(
                    data={
                        "session_id": payload.session_id,
                        "role": "AI",
                        "content": full_response
                    }
                )
            await db.disconnect()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream"
    )   