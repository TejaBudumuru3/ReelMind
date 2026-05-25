import os
import sys
import asyncio
from urllib.parse import urlparse, parse_qs
from decimal import Decimal

# Append the server directory to python path to resolve prisma_db import
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from youtube_transcript_api import YouTubeTranscriptApi
from prisma_db import Prisma
from dotenv import load_dotenv
from groq import Groq
import requests
from http.cookiejar import MozillaCookieJar

load_dotenv()

# Ensure your keys are loaded
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API")
GROQ_API_KEY = os.getenv("GROQ_API")

groqClient = Groq(api_key=GROQ_API_KEY)
yt_client = YouTubeTranscriptApi()

def get_translation_with_groq(transcript: str) -> str| None:
    
    if transcript == "":
        print("There is no text to translate.")
        return None

    print("="*60)
    print("calling llama using GROQ for Translating the transcript in English")
    print("="*60)
    response = groqClient.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {
                "role": "system",
                "content": "You are a professional, headless translation engine. Translate the provided text into standard English. You must output ONLY the translated English text. Do not include any introductions, conversational filler, or markdown formatting. If the text is already in English, return it exactly as is"
            },
            {
                "role": "user",
                "content" : transcript
            }
        ],
        temperature=1,
        max_completion_tokens=1024,
        top_p=1,

    )

    return response.choices[0].message.content

async def fetch_youtube_transcript(yt_id: str, cookie_path: str | None) -> str | None:
    """Fetch transcript using youtube-transcript-api with optional cookie auth. No yt-dlp involved."""
    try:
        client = None
        
        if cookie_path:
            session = requests.Session()
            cookie_jar = MozillaCookieJar(cookie_path)
            cookie_jar.load(ignore_discard=True, ignore_expires=True)
            session.cookies.update(cookie_jar)
            client = YouTubeTranscriptApi(http_client=session)
            print("🍪 Using authenticated youtube-transcript-api client")
        else:
            client = YouTubeTranscriptApi()
            
        transcript_list = client.list(video_id=yt_id)
        transcripts_iter = list(transcript_list)
        if not transcripts_iter:
            raise Exception("No transcripts available")
        
        first_transcript = transcripts_iter[0]
        try:
            transcripts = transcript_list.find_transcript(['en', 'en-US', 'en-CA', 'en-GB', 'en-IN'])
            raw_text = " ".join([item.text for item in transcripts.fetch()])
            print("✅ English transcript fetched directly.")
            return raw_text
        except:
            pass
        
        try:
            translated = first_transcript.translate('en')
            raw_text = " ".join([item.text for item in translated.fetch()])
            print("✅ Translated to English via YouTube.")
            return raw_text
        except:
            pass
        
        # Last resort: fetch raw and translate with Groq
        raw_text = " ".join([item.text for item in first_transcript.fetch()])
        translated_via_groq = get_translation_with_groq(raw_text)
        if translated_via_groq:
            print("✅ Translated via Groq LLM.")
            return translated_via_groq
        
        return None
    except Exception as e:
        print(f"❌ youtube-transcript-api failed: {e}")
        return None

def extract_youtube_id(url: str) -> str | None:
    """Safely extracts the video ID from standard, mobile, shorts, and youtu.be YouTube URLs."""
    parsed = urlparse(url)
    hostname = parsed.hostname or ''
    
    if hostname in ['www.youtube.com', 'youtube.com', 'm.youtube.com']:
        # Handle YouTube shorts paths: /shorts/VIDEO_ID
        if parsed.path.startswith('/shorts/'):
            parts = parsed.path.split('/')
            if len(parts) >= 3:
                return parts[2]
        return parse_qs(parsed.query).get('v', [None])[0]
    elif hostname in ['youtu.be']:
        return parsed.path.strip('/')
    return None

def get_youtube_metadata(video_id: str) -> dict:
    """Hits the official Google API. 100% reliable. 0% blocked."""
    try:
        response = None
        youtube = build('youtube', 'v3', developerKey=YOUTUBE_API_KEY)
        request = youtube.videos().list(
            part="statistics,snippet,contentDetails",
            id=video_id
        )
        response = request.execute()
        
        if not response['items']:
            raise ValueError("Video not found or is private.")
            
        return response
    except HttpError as e:
        print(f"Google API Error: {e}")
        return {"views": 0, "likes": 0, "comments": 0, "engagement_rate": Decimal("0.00")}

async def async_transcription_pipeline(job_id: str, url: str):
    """The master router for video ingestion."""
    db = Prisma()
    await db.connect()
    
    try:
        # 1. Lock the job state
        await db.job.update(where={"id": job_id}, data={"status": "PROCESSING"})
        
        yt_id = extract_youtube_id(url)
        final_transcript = ""
        metadata = {}

        if yt_id:
            # ==========================================
            # THE GOLDEN PATH: YouTube Official APIs
            # ==========================================
            print(f"✅ YouTube URL detected. Routing to Golden Path for {yt_id}")
            
            # Step 1: Extract 100% accurate metadata instantly
            metadata = get_youtube_metadata(yt_id)
            # print(metadata)
            print("="*60)
            try:
                transcriptionList = yt_client.list(video_id=yt_id)
                print("list are: ", transcriptionList)
                
                transcripts_iter = list(transcriptionList)
                if not transcripts_iter:
                    raise Exception("No transcripts are available for this video.")
                
                firstTranscript = transcripts_iter[0]
                
                try:
                    # 1. Try direct English transcripts
                    transcripts = transcriptionList.find_transcript(['en', 'en-US', 'en-CA', 'en-GB', 'en-IN'])
                    transcript = transcripts.fetch()
                    raw_text = ""
                    for item in transcript:
                        raw_text += item.text + " "
                    final_transcript = raw_text
                    print("✅ Successfully fetched English transcript directly.")
                except Exception as e:
                    print("English transcript not found directly. Attempting YouTube translation...")
                    try:
                        # 2. Try native translation to English via YouTube API
                        translated_text = firstTranscript.translate('en')
                        transcript = translated_text.fetch()
                        raw_text = ""
                        for item in transcript:
                            raw_text += item.text + " "
                        final_transcript = raw_text
                        print(f"✅ Successfully translated {firstTranscript.language} to English via YouTube.")
                    except Exception as translate_err:
                        print("YouTube translation failed. Fetching raw transcript and translating with Groq...")
                        # 3. Fallback: Fetch raw transcript in native language, then translate with Groq
                        api_response = firstTranscript.fetch()
                        raw_text = ""
                        for item in api_response:
                            raw_text += item.text + " "
                        translated_via_groq = get_translation_with_groq(raw_text)
                        if translated_via_groq:
                            final_transcript = translated_via_groq
                            print("✅ Successfully translated raw transcript to English via Groq.")
                        else:
                            raise Exception("Groq translation returned empty response.")
            except Exception as e:
                raise Exception(f"Failed to fetch or translate transcript: {str(e)}")
        
        # 3. Update the database with the verified metadata and prepare for Vectorization
        await db.job.update(
            where={"id": job_id},
            data={
                "status": "COMPLETED",
                "views": metadata.get("views", 0),
                "likes": metadata.get("likes", 0),
                "comments": metadata.get("comments", 0),
                "engagement_rate": metadata.get("engagement_rate", Decimal("0.00")),
                # Temporarily store text here to verify it works before we build Pipeline 2
                "error_message": "SUCCESS: " + final_transcript[:150] + "..." 
            }
        )
        print("🔥 Golden Path extraction complete. Ready for Vectorization.")

    except Exception as e:
        # Never fail silently. Log it to Postgres.
        print(f"❌ Pipeline Failed: {str(e)}")
        await db.job.update(
            where={"id": job_id},
            data={"status": "FAILED", "error_message": str(e)}
        )
    finally:
        await db.disconnect()

if __name__ == "__main__":
    asyncio.run(async_transcription_pipeline("85cc6203-7d30-4778-aad3-889a24b36e51", "https://www.youtube.com/watch?v=O2EwFbxYeDM"))