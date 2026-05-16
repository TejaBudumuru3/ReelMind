import os
import json
from fastapi import FastAPI, Request, HTTPException, Response
from pydantic import BaseModel
from qstash import QStash, Receiver
from dotenv import load_dotenv

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
    job_id: str

@app.post('/ingest')
async def ingest_url(payload: IngestPayload):

    worker_url = os.getenv('WORKER_URL', 'http://localhost:8000/worker')

    try:
        res = qstash_client.message.publish_json(
            url=worker_url,
            body={
                'url': payload.url,
                'job_id': payload.job_id
            },
            retries=3,
            delay=1
        )
    except Exception as e:
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
        