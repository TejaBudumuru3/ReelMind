import json
import yt_dlp
from decimal import Decimal
import os
import re
import base64
import tempfile
import httpx
import uuid
from groq import Groq
from prisma_db import Prisma
from datetime import datetime
import asyncio
from dotenv import load_dotenv
from googleapiclient.discovery import build
from worker.embeddings import embedd_and_store
from worker.youtube import extract_youtube_id, get_translation_with_groq, yt_client, get_youtube_metadata, fetch_youtube_transcript, fetch_transcript_via_proxy, fetch_transcript_via_innertube, fetch_transcript_via_ytdlp, fetch_transcript_via_public_apis



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



_COOKIE_FILE_PATH = None

def get_cookies_file_path():
    global _COOKIE_FILE_PATH
    if _COOKIE_FILE_PATH and os.path.exists(_COOKIE_FILE_PATH):
        return _COOKIE_FILE_PATH
        
    b64_cookies = os.getenv("COOKIES")
    if not b64_cookies:
        return None
        
    cookie_file = tempfile.NamedTemporaryFile(delete=False, mode='w', suffix='.txt')
    try:
        decoded_bytes = base64.b64decode(b64_cookies)
        decoded_text = decoded_bytes.decode('utf-8', errors='ignore')
        
        # Forcibly write a pristine Netscape header
        cookie_file.write("# Netscape HTTP Cookie File\n\n")
        
        lines = decoded_text.splitlines()
        valid_lines = 0
        domains = {}
        
        for line in lines:
            line = line.strip()
            # Skip empty lines or any broken/duplicate headers
            if not line or "Netscape HTTP Cookie File" in line:
                continue
                
            cookie_file.write(line + "\n")
            
            if not line.startswith('#'):
                parts = line.split('\t')
                if len(parts) >= 7:
                    valid_lines += 1
                    d = parts[0]
                    domains[d] = domains.get(d, 0) + 1
                    
        cookie_file.close()
        print(f"🍪 Loaded {valid_lines} cookies from env: {dict(domains)}")
        
        _COOKIE_FILE_PATH = cookie_file.name
        return _COOKIE_FILE_PATH
    except Exception as e:
        print(f"Failed to load cookies: {e}")
        return None

def get_secure_ydl_opts():
    """Decodes the cookie string from .env and creates a temporary file."""
    base_options = {
        'format': 'worstaudio[protocol!*=m3u8][protocol!=dash]/bestaudio[protocol!*=m3u8][protocol!=dash]/worst/bestaudio/best',
        'quiet': True,
        'no_warnings': True,
        'skip_download': True,
        'extractor_args': {
            'youtube': {
                'player_client': ['android_embed', 'ios_embed', 'android_sdkless', 'tv_embedded']
            }
        },
        'http_headers': {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.113 Mobile Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
        }
    }
    
    cookie_path = get_cookies_file_path()
    if cookie_path:
        base_options['cookiefile'] = cookie_path
        print("🍪 Cookie file loaded from env")
    else:
        print("⚠️ WARNING: No cookies found! yt-dlp will run without authentication.")
        
    # Set proxy for yt-dlp if residential proxy URL is available
    proxy_url = os.getenv("RESIDENTIAL_PROXY_URL")
    if proxy_url:
        base_options['proxy'] = proxy_url
        print("🌐 Routing yt-dlp through residential proxy")
        
    return base_options


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

            yt_id = extract_youtube_id(url)
            use_yt_api = False
            fallback_to_ytdlp = False

            if yt_id:
                print(f"🟢 YouTube URL detected (id={yt_id}). Trying official API path...")
                response = get_youtube_metadata(yt_id)

                if not response:
                    print(f"⚠️ Data API returned no items for {yt_id} (Shorts-only video).")

            if yt_id and response:
                # =====================================================
                # YOUTUBE FULL PATH: Data API + transcript-api
                # =====================================================
                item = response['items'][0]
                stats = item['statistics']
                snippet = item['snippet']
                content = item.get('contentDetails', {})
                
                views = int(stats.get('viewCount', 0))
                likes = int(stats.get('likeCount', 0))
                comments = int(stats.get('commentCount', 0))
                
                engagement_rate = 0.00
                if views > 0:
                    engagement_rate = round(((likes + comments) / views) * 100, 2)
                
                dur_str = content.get('duration', 'PT0S')
                import isodate
                try:
                    duration_seconds = int(isodate.parse_duration(dur_str).total_seconds())
                except:
                    duration_seconds = 0

                if duration_seconds > 900:
                    await db.job.update(
                        where={"id": job_id},
                        data={"status": 'FAILED', "error_message": f"Video duration is {duration_seconds} seconds", "updated_at": datetime.now()}
                    )
                    raise Exception("Video duration exceeded")

                text = f"{snippet.get('title', '')} {snippet.get('description', '')}"
                hashtags = re.findall(r"#\w+", text)
                thumbnails = snippet.get('thumbnails', {})
                thumbnail_url = (thumbnails.get('maxres') or thumbnails.get('high') or thumbnails.get('default') or {}).get('url', '')

                video_id = yt_id

                # Cache check
                existing_job = await db.job.find_first(
                    where={"video_id": video_id, "status": "COMPLETED", "id": {"not": job_id}}
                )
                if existing_job:
                    print(f"♻️ CACHE HIT! Reusing data from previous job {existing_job.id}")
                    await db.job.update(
                        where={"id": job_id},
                        data={
                            "status": 'COMPLETED', "video_id": video_id, "url": url,
                            "views": existing_job.views, "likes": existing_job.likes,
                            "comments": existing_job.comments, "engagement_rate": existing_job.engagement_rate,
                            "hashtags": existing_job.hashtags, "title": existing_job.title,
                            "creator": existing_job.creator, "follower_count": existing_job.follower_count,
                            "duration": existing_job.duration, "upload_date": existing_job.upload_date,
                            "thumbnail_url": existing_job.thumbnail_url, "platform": existing_job.platform,
                            "transcript": existing_job.transcript, "updated_at": datetime.now()
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
                    where={"id": job_id},
                    data={
                        "status": 'PROCESSING', "url": url, "video_id": video_id,
                        "views": views, "likes": likes, "comments": comments,
                        "engagement_rate": engagement_rate, "hashtags": hashtags,
                        "title": snippet.get('title'), "creator": snippet.get('channelTitle'),
                        "duration": duration_seconds, "upload_date": snippet.get('publishedAt', '')[:10].replace('-', ''),
                        "thumbnail_url": thumbnail_url, "platform": "Youtube",
                        "updated_at": datetime.now()
                    }
                )

                # Get transcript via youtube-transcript-api
                print(f"📝 Fetching transcript for {yt_id}...")
                cookie_path = get_cookies_file_path()
                final_transcript = await fetch_youtube_transcript(yt_id, cookie_path)

                if final_transcript:
                    await embedd_and_store(final_transcript, job_id, job.session_id)
                    await db.job.update(
                        where={"id": job_id},
                        data={"status": 'COMPLETED', "updated_at": datetime.now(), "transcript": final_transcript}
                    )
                    await db.execute_raw(f"SELECT pg_notify('job_updates', '{job_id}')")
                    print("🎉 YouTube pipeline completed successfully")
                else:
                    print("⚠️ youtube-transcript-api failed. Trying residential proxy...")
                    final_transcript = await fetch_transcript_via_proxy(yt_id)
                    if final_transcript:
                        await embedd_and_store(final_transcript, job_id, job.session_id)
                        await db.job.update(
                            where={"id": job_id},
                            data={"status": 'COMPLETED', "updated_at": datetime.now(), "transcript": final_transcript}
                        )
                        await db.execute_raw(f"SELECT pg_notify('job_updates', '{job_id}')")
                        print("🎉 YouTube pipeline completed via proxy")
                    else:
                        print("⚠️ Proxy also failed. Trying innertube (watch page scraping)...")
                        final_transcript = await fetch_transcript_via_innertube(yt_id, cookie_path)
                        if final_transcript:
                            await embedd_and_store(final_transcript, job_id, job.session_id)
                            await db.job.update(
                                where={"id": job_id},
                                data={"status": 'COMPLETED', "updated_at": datetime.now(), "transcript": final_transcript}
                            )
                            await db.execute_raw(f"SELECT pg_notify('job_updates', '{job_id}')")
                            print("🎉 YouTube pipeline completed via innertube")
                        else:
                            print("⚠️ Innertube also failed. Trying yt-dlp captions extraction...")
                            final_transcript = await fetch_transcript_via_ytdlp(yt_id, cookie_path)
                            if final_transcript:
                                await embedd_and_store(final_transcript, job_id, job.session_id)
                                await db.job.update(
                                    where={"id": job_id},
                                    data={"status": 'COMPLETED', "updated_at": datetime.now(), "transcript": final_transcript}
                                )
                                await db.execute_raw(f"SELECT pg_notify('job_updates', '{job_id}')")
                                print("🎉 YouTube pipeline completed via yt-dlp captions")
                            else:
                                print("⚠️ yt-dlp captions also failed. Trying public APIs (Invidious)...")
                                final_transcript = await fetch_transcript_via_public_apis(yt_id)
                                if final_transcript:
                                    await embedd_and_store(final_transcript, job_id, job.session_id)
                                    await db.job.update(
                                        where={"id": job_id},
                                        data={"status": 'COMPLETED', "updated_at": datetime.now(), "transcript": final_transcript}
                                    )
                                    await db.execute_raw(f"SELECT pg_notify('job_updates', '{job_id}')")
                                    print("🎉 YouTube pipeline completed via public APIs")
                                else:
                                    print("⚠️ Public APIs also failed. Falling back to yt-dlp audio download + Whisper...")
                                    fallback_to_ytdlp = True

            elif yt_id and not response:
                # =====================================================
                # YOUTUBE SHORTS-ONLY PATH: No metadata, transcript only
                # =====================================================
                print(f"🟡 Shorts-only fallback for {yt_id}. Trying transcript-api without metadata...")

                await db.job.update(
                    where={"id": job_id},
                    data={
                        "status": 'PROCESSING', "url": url, "video_id": yt_id,
                        "platform": "Youtube", "title": f"YouTube Short {yt_id}",
                        "thumbnail_url": f"https://i.ytimg.com/vi/{yt_id}/hqdefault.jpg",
                        "updated_at": datetime.now()
                    }
                )

                cookie_path = get_cookies_file_path()
                final_transcript = await fetch_youtube_transcript(yt_id, cookie_path)

                if final_transcript:
                    await embedd_and_store(final_transcript, job_id, job.session_id)
                    await db.job.update(
                        where={"id": job_id},
                        data={"status": 'COMPLETED', "updated_at": datetime.now(), "transcript": final_transcript}
                    )
                    await db.execute_raw(f"SELECT pg_notify('job_updates', '{job_id}')")
                    print("🎉 Shorts-only pipeline completed (transcript only, no stats)")
                else:
                    print("⚠️ youtube-transcript-api failed for Short. Trying residential proxy...")
                    final_transcript = await fetch_transcript_via_proxy(yt_id)
                    if final_transcript:
                        await embedd_and_store(final_transcript, job_id, job.session_id)
                        await db.job.update(
                            where={"id": job_id},
                            data={"status": 'COMPLETED', "updated_at": datetime.now(), "transcript": final_transcript}
                        )
                        await db.execute_raw(f"SELECT pg_notify('job_updates', '{job_id}')")
                        print("🎉 Shorts pipeline completed via proxy")
                    else:
                        print("⚠️ Proxy also failed for Short. Trying innertube...")
                        final_transcript = await fetch_transcript_via_innertube(yt_id, cookie_path)
                        if final_transcript:
                            await embedd_and_store(final_transcript, job_id, job.session_id)
                            await db.job.update(
                                where={"id": job_id},
                                data={"status": 'COMPLETED', "updated_at": datetime.now(), "transcript": final_transcript}
                            )
                            await db.execute_raw(f"SELECT pg_notify('job_updates', '{job_id}')")
                            print("🎉 Shorts pipeline completed via innertube")
                        else:
                            print("⚠️ Innertube also failed for Short. Trying yt-dlp captions extraction...")
                            final_transcript = await fetch_transcript_via_ytdlp(yt_id, cookie_path)
                            if final_transcript:
                                await embedd_and_store(final_transcript, job_id, job.session_id)
                                await db.job.update(
                                    where={"id": job_id},
                                    data={"status": 'COMPLETED', "updated_at": datetime.now(), "transcript": final_transcript}
                                )
                                await db.execute_raw(f"SELECT pg_notify('job_updates', '{job_id}')")
                                print("🎉 Shorts pipeline completed via yt-dlp captions")
                            else:
                                print("⚠️ yt-dlp captions also failed for Short. Trying public APIs (Invidious)...")
                                final_transcript = await fetch_transcript_via_public_apis(yt_id)
                                if final_transcript:
                                    await embedd_and_store(final_transcript, job_id, job.session_id)
                                    await db.job.update(
                                        where={"id": job_id},
                                        data={"status": 'COMPLETED', "updated_at": datetime.now(), "transcript": final_transcript}
                                    )
                                    await db.execute_raw(f"SELECT pg_notify('job_updates', '{job_id}')")
                                    print("🎉 Shorts pipeline completed via public APIs")
                                else:
                                    print("⚠️ Public APIs also failed for Short. Falling back to yt-dlp audio download + Whisper...")
                                    fallback_to_ytdlp = True

            if (not yt_id) or fallback_to_ytdlp:
                # =====================================================
                # NON-YOUTUBE PATH: Instagram, X, Facebook via yt-dlp
                # =====================================================
                print(f"🔵 Using yt-dlp path for: {url}")
                ydl_options = get_secure_ydl_opts()
                info = None
                try:
                    with yt_dlp.YoutubeDL(ydl_options) as ydl:
                        info = ydl.extract_info(url=url, download=False)
                except Exception as e:
                    print(f"⚠️ Primary yt-dlp metadata extraction failed: {e}")
                    if 'proxy' in ydl_options:
                        print("🔄 Retrying yt-dlp metadata extraction WITHOUT proxy...")
                        fallback_options = ydl_options.copy()
                        fallback_options.pop('proxy', None)
                        try:
                            with yt_dlp.YoutubeDL(fallback_options) as ydl:
                                info = ydl.extract_info(url=url, download=False)
                        except Exception as fe:
                            print(f"❌ Fallback yt-dlp metadata extraction also failed: {fe}")
                            raise fe
                    else:
                        raise e
                
                under_limit = get_audio_limit(info)
                if under_limit.get('limit') == False:
                    await db.job.update(
                        where={"id": job_id},
                        data={"status": 'FAILED', "error_message": f"Video duration is {under_limit.get('duration')} seconds", "updated_at": datetime.now()}
                    )
                    await db.execute_raw(f"SELECT pg_notify('job_updates', '{job_id}')")
                    raise Exception("Video duration exceeded")

                metadata = extract_social_metadata(info)
                video_id = metadata.get('id')
                
                if video_id:
                    existing_job = await db.job.find_first(
                        where={"video_id": video_id, "status": "COMPLETED", "id": {"not": job_id}}
                    )
                    if existing_job:
                        print(f"♻️ CACHE HIT! Reusing data from previous job {existing_job.id}")
                        await db.job.update(
                            where={"id": job_id},
                            data={
                                "status": 'COMPLETED', "video_id": video_id, "url": url,
                                "views": existing_job.views, "likes": existing_job.likes,
                                "comments": existing_job.comments, "engagement_rate": existing_job.engagement_rate,
                                "hashtags": existing_job.hashtags, "title": existing_job.title,
                                "creator": existing_job.creator, "follower_count": existing_job.follower_count,
                                "duration": existing_job.duration, "upload_date": existing_job.upload_date,
                                "thumbnail_url": existing_job.thumbnail_url, "platform": existing_job.platform,
                                "transcript": existing_job.transcript, "updated_at": datetime.now()
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
                    where={"id": job_id},
                    data={
                        "status": 'PROCESSING', "url": url, "video_id": video_id,
                        "views": metadata.get('views'), "likes": metadata.get('likes'),
                        "comments": metadata.get('comments'), 'engagement_rate': metadata.get('engagement_rate'),
                        'hashtags': metadata.get('hashtags'), 'title': metadata.get('title'),
                        'creator': metadata.get('creator'), 'follower_count': metadata.get('follower_count'),
                        'duration': metadata.get('duration'), 'upload_date': metadata.get('upload_date'),
                        'thumbnail_url': metadata.get('thumbnail_url'), 'platform': metadata.get('platform'),
                        'updated_at': datetime.now()
                    }
                )

                transcription = get_transcription_from_groq(info)
                if transcription:
                    await embedd_and_store(transcription, job_id, job.session_id)
                    await db.job.update(
                        where={"id": job_id},
                        data={"status": 'COMPLETED', "updated_at": datetime.now(), "transcript": transcription}
                    )
                    await db.execute_raw(f"SELECT pg_notify('job_updates', '{job_id}')")
                    print("pipeline completed successfully")
                else:
                    await db.job.update(
                        where={"id": job_id},
                        data={"status": 'FAILED', "error_message": "Transcription failed", "updated_at": datetime.now()}
                    )
                    await db.execute_raw(f"SELECT pg_notify('job_updates', '{job_id}')")
    except Exception as e:
        print(f"Pipeline failed: {e}")
        try:
            current = await db.job.find_unique(where={"id": job_id})
            if current and current.status not in ['COMPLETED', 'FAILED']:
                await db.job.update(
                    where={"id": job_id},
                    data={"status": "FAILED", "error_message": str(e), "updated_at": datetime.now()}
                )
                await db.execute_raw(f"SELECT pg_notify('job_updates', '{job_id}')")
            else:
                print(f"⏭️ Skipping error update — job {job_id} is already {current.status if current else 'missing'}")
        except Exception as inner_e:
            print(f"Failed to update job status on error: {inner_e}")
    finally:
        await db.disconnect()




if __name__ == "__main__":
    asyncio.run(async_pipeline_link_to_text(
        "ebbc98a2-9c4a-46cc-a910-af57714d5d4c", 
        "https://x.com/keyfipyIasimIar/status/2056630939950948391?s=20"
    ))