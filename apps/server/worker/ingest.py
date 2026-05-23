import json
import yt_dlp
from decimal import Decimal
import os
import re
import httpx
import uuid
from groq import Groq
from prisma_db import Prisma
from datetime import datetime
import asyncio
from dotenv import load_dotenv
from googleapiclient.discovery import build
from worker.embeddings import embedd_and_store



load_dotenv()
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API")

cookie_path = os.path.join(os.path.dirname(__file__), 'cookies.txt') 

GROQ_API_KEY = os.getenv("GROQ_API")

groqClient = Groq(api_key=GROQ_API_KEY)

def extract_social_metadata(info: dict) -> dict:
    views=0
    likes=0
    comments=0
    try:
        
        if 'entries' in info:
            print("⚠️ Detected a playlist/series URL instead of a single video.")
            info = info['entries'][0]
        
        if (info.get('extractor') or  '').lower() == "youtube":
            youtube = build('youtube', 'v3', developerKey=YOUTUBE_API_KEY)
            request = youtube.videos().list(
                part="statistics",
                id=info.get('id')
            )
            response = request.execute()

            if not response['items']:
                raise ValueError("Video not found or is private.")
            
            stats = response['items'][0]['statistics']
            views = int(stats.get('viewCount', 0))
            likes = int(stats.get('likeCount', 0))
            comments = int(stats.get('commentCount', 0))
        else:
            views = info.get('view_count') or 0
            likes = info.get('like_count') or 0
            comments = info.get('comment_count') or 0

            if views == 0 and likes == 0:
                likes = info.get('like_count') or info.get('upvote_count') or 0
                comments = info.get('comment_count') or info.get('reply_count') or 0
                views = (info.get('view_count') or info.get('play_count') or info.get('repost_count') or 0)
        
        print(f"📊 EXTRACTED -> Views: {views}, Likes: {likes}, Comments: {comments}")
        
        engagement_rate = 0.00
        if views > 0:
            engagement = ((likes + comments) / views) * 100
            engagement_rate = round(engagement, 2)

        text = f"{info.get('title', '')} {info.get('description', '')}" 
        hashtags = re.findall(r"#\w+", text)
        
        return {
            "views": views,
            "likes": likes,
            "comments": comments,
            "engagement_rate": float((engagement_rate)),
            "hashtags": hashtags,
            "title": info.get('title'),
            "creator": info.get('uploader') or info.get('channel'),
            "follower_count": info.get('channel_follower_count'),
            "duration": info.get('duration'),
            "upload_date": info.get('upload_date'),
            "thumbnail_url": info.get('thumbnail'),
            "id": info.get('id'),
            'platform': info.get('extractor_key')
        }
    except Exception as e:
        print(f"Metadata extraction failed: {e}")
        return {"views": 0, "likes": 0, "comments": 0, "engagement_rate": Decimal("0.00")}

def get_audio_limit(info: dict) -> dict:

    duration = info.get('duration') or 0
    if duration > 900:            
        return {
            "limit": False,
            "duration": duration
        }
    else:
        return {
            "limit": True,
            "duration": duration
        }

def get_audio_from_hls(info: dict)-> bytes | None:
    try:
        m3u8_url = info.get('url')
        
        headers = info.get('http_headers', {})
        with httpx.Client(timeout=60, headers=headers) as client:
            manifest = client.get(m3u8_url).text

            base_url = m3u8_url.rsplit('/', 1)[0] + '/'

            segment_urls = []
            for line in manifest.splitlines():
                line = line.strip()
                if line and not line.startswith('#'):
                    url = line if line.startswith('http') else base_url + line
                    segment_urls.append(url)
            
            if not segment_urls:
                raise Exception("No segments found in HLS manifest")

            print("downloading all segments into memory")

            audio_bytes = b''

            for seg in segment_urls:
                res = client.get(seg)
                audio_bytes += res.content

            print(f'Total audio in memory with {len(audio_bytes) / 1024 / 1024} MB')
            return audio_bytes

        
    except Exception as e:
        print(f"Failed to download HLS audio: {e}")
        return None

def get_transcription_from_groq(info: dict) -> str | None:

    try: 
        # extract media url
        media_url = info.get('url')
        ext = info.get('ext', 'm4a')
        audio_bytes = b''
        protocol = info.get('protocol', '')

        if not media_url:
            raise Exception("Could not extract direct media URL")
        
        is_stream = protocol in ('m3u8', 'm3u8_native', 'http_dash_segments', 'dash')

        if is_stream:
            print(f"⚠️ Detected streaming protocol ({protocol}). Falling back to temp file download...")
            audio_bytes = get_audio_from_hls(info)
        else: 
            headers = info.get('http_headers', {})
            
            with httpx.Client() as client:
                response = client.get(media_url, headers=headers, timeout=120, follow_redirects=True)
                audio_bytes = response.content
    

        print("Calling Groq for transcription")

        file_name = f'{uuid.uuid4()}.{ext}'

        transcription = groqClient.audio.transcriptions.create(
            file=(file_name, audio_bytes),
            model='whisper-large-v3',
            language='en',
            response_format='json',
        )
        
        print("Done with transcription")
        return transcription.text
    except Exception as e:
        print(f"Transcription failed: {e}")
        return None



async def async_pipeline_link_to_text(job_id: str, url: str):
    db = Prisma()
    try:
    
        await db.connect()
        job = await db.job.find_first(
            where={ "id": job_id },
        )

        if not job:
            raise Exception("Job not found")
        
        # Idempotency: if QStash retries and job is already done, skip silently
        if job.status in ['COMPLETED', 'FAILED', 'PROCESSING']:
            print(f"⏭️ Job {job_id} already {job.status}, skipping duplicate delivery.")
            return

        if job.status == 'PENDING':

            ydl_options = {
                'format': 'worstaudio[protocol!*=m3u8][protocol!=dash]/bestaudio[protocol!*=m3u8][protocol!=dash]/worst/bestaudio/best',
                'quiet': True,
                'no_warnings': True,
                'skip_download': True
            }

            if os.path.exists(cookie_path):
                ydl_options['cookiefile'] = cookie_path
            else:
                print("⚠️ Warning: cookies.txt not found. Instagram/TikTok may block extraction.")
            
            with yt_dlp.YoutubeDL(ydl_options) as ydl:
                info = ydl.extract_info(url=url, download=False)
            #  checks for limit
            under_limit = get_audio_limit(info)

            if under_limit.get('limit') == False:

                await db.job.update(
                    where={ "id": job_id},
                    data={
                        "status": 'FAILED',
                        "error_message": f"Video duration is {under_limit.get('duration')} seconds",
                        "updated_at": datetime.now()
                    }
                )
                await db.execute_raw(f"SELECT pg_notify('job_updates', '{job_id}')")
                raise Exception("Video duration exceeded")

            #  extracting metadata
            metadata = extract_social_metadata(info)
            video_id = metadata.get('id')
            
            if video_id:
                existing_job = await db.job.find_first(
                    where={
                        "video_id": video_id,
                        "status": "COMPLETED",
                        "id": { "not": job_id }
                    }
                )
                
                if existing_job:
                    print(f"♻️ CACHE HIT! Reusing data from previous job {existing_job.id}")
                    await db.job.update(
                        where={ "id": job_id },
                        data={
                            "status": 'COMPLETED',
                            "video_id": video_id,
                            "url": url,
                            "views": existing_job.views,
                            "likes": existing_job.likes,
                            "comments": existing_job.comments,
                            "engagement_rate": existing_job.engagement_rate,
                            "hashtags": existing_job.hashtags,
                            "title": existing_job.title,
                            "creator": existing_job.creator,
                            "follower_count": existing_job.follower_count,
                            "duration": existing_job.duration,
                            "upload_date": existing_job.upload_date,
                            "thumbnail_url": existing_job.thumbnail_url,
                            "platform": existing_job.platform,
                            "transcript": existing_job.transcript,
                            "updated_at": datetime.now()
                        }
                    )
                    
                    await db.execute_raw(f"""
                        INSERT INTO "Chunk" (id, job_id, session_id, content, chunk_index, embedding, metadata, created_at)
                        SELECT gen_random_uuid(), '{job_id}'::uuid, '{job.session_id}'::uuid, content, chunk_index, embedding, metadata, now()
                        FROM "Chunk"
                        WHERE job_id = '{existing_job.id}'::uuid
                    """)
                    
                    await db.execute_raw(f"SELECT pg_notify('job_updates', '{job_id}')")
                    return

            await db.job.update(
                where={ "id": job_id},
                data={
                    "status": 'PROCESSING',
                    "url": url,
                    # "label": label,
                    "video_id": video_id,
                    "views": metadata.get('views'),
                    "likes": metadata.get('likes'),
                    "comments": metadata.get('comments'),
                    'engagement_rate': metadata.get('engagement_rate'),
                    'hashtags': metadata.get('hashtags'),
                    'title': metadata.get('title'),
                    'creator': metadata.get('creator'),
                    'follower_count': metadata.get('follower_count'),
                    'duration': metadata.get('duration'),
                    'upload_date': metadata.get('upload_date'),
                    'thumbnail_url': metadata.get('thumbnail_url'),
                    'platform': metadata.get('platform'),
                    'updated_at': datetime.now()
                }
            )

            #  Transcription from audio via Groq

            transcription = get_transcription_from_groq(info)
            if transcription:

                await embedd_and_store(transcription, job_id, job.session_id)
                await db.job.update(
                    where={ "id": job_id},
                    data={
                        "status": 'COMPLETED',
                        "updated_at": datetime.now(),
                        "transcript": transcription
                    }
                )
                await db.execute_raw(f"SELECT pg_notify('job_updates', '{job_id}')")
                print("pipeline completed successfully")
            else:
                await db.job.update(
                    where={ "id": job_id},
                    data={
                        "status": 'FAILED',
                        "error_message": "Transcription failed",
                        "updated_at": datetime.now()
                    }
                )
                await db.execute_raw(f"SELECT pg_notify('job_updates', '{job_id}')")
    except Exception as e:
        print(f"Pipeline failed: {e}")
        try:
            # Guard: never overwrite a COMPLETED job on error
            current = await db.job.find_unique(where={"id": job_id})
            if current and current.status not in ['COMPLETED', 'FAILED']:
                await db.job.update(
                    where={"id": job_id},
                    data={
                        "status": "FAILED",
                        "error_message": str(e),
                        "updated_at": datetime.now()
                    }
                )
                await db.execute_raw(f"SELECT pg_notify('job_updates', '{job_id}')")
            else:
                print(f"⏭️ Skipping error update — job {job_id} is already {current.status if current else 'missing'}")
        except Exception as inner_e:
            print(f"Failed to update job status on error: {inner_e}")
    finally:
        await db.disconnect()

# formatted = formatters.Formatter().format_transcript(transcription, indent=2)
# print(transcription)




if __name__ == "__main__":
    asyncio.run(async_pipeline_link_to_text(
        "ebbc98a2-9c4a-46cc-a910-af57714d5d4c", 
        "https://x.com/keyfipyIasimIar/status/2056630939950948391?s=20"
    ))