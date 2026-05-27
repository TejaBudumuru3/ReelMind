import os
import sys
import asyncio
from urllib.parse import urlparse, parse_qs
from decimal import Decimal
from xml.etree import ElementTree
import html

# Append the server directory to python path to resolve prisma_db import
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api.proxies import GenericProxyConfig
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
    """Fetch transcript using youtube-transcript-api trying multiple configurations sequentially:
    1. Cookies + Proxy (if both available)
    2. Cookies + No Proxy
    3. No Cookies + Proxy (if proxy available)
    4. No Cookies + No Proxy
    """
    proxy_url = os.getenv("RESIDENTIAL_PROXY_URL")
    
    # Define configurations to try
    configs = []
    if cookie_path and proxy_url:
        configs.append({"use_cookies": True, "use_proxy": True})
    if cookie_path:
        configs.append({"use_cookies": True, "use_proxy": False})
    if proxy_url:
        configs.append({"use_cookies": False, "use_proxy": True})
    configs.append({"use_cookies": False, "use_proxy": False})
    
    for config in configs:
        use_cookies = config["use_cookies"]
        use_proxy = config["use_proxy"]
        print(f"📝 youtube-transcript-api: Trying fetch (cookies={use_cookies}, proxy={use_proxy})...")
        
        try:
            session = requests.Session()
            if use_proxy and proxy_url:
                session.proxies = {
                    "http": proxy_url,
                    "https": proxy_url,
                }
            if use_cookies and cookie_path:
                cookie_jar = MozillaCookieJar(cookie_path)
                cookie_jar.load(ignore_discard=True, ignore_expires=True)
                session.cookies.update(cookie_jar)
            
            client = YouTubeTranscriptApi(http_client=session)
            transcript_list = client.list(video_id=yt_id)
            transcripts_iter = list(transcript_list)
            if not transcripts_iter:
                raise Exception("No transcripts available")
                
            first_transcript = transcripts_iter[0]
            # Try direct English
            try:
                transcripts = transcript_list.find_transcript(['en', 'en-US', 'en-CA', 'en-GB', 'en-IN'])
                raw_text = " ".join([item.text for item in transcripts.fetch()])
                print(f"✅ English transcript fetched directly (cookies={use_cookies}, proxy={use_proxy}).")
                return raw_text
            except:
                pass
            
            # Try YouTube translation
            try:
                translated = first_transcript.translate('en')
                raw_text = " ".join([item.text for item in translated.fetch()])
                print(f"✅ Translated to English via YouTube (cookies={use_cookies}, proxy={use_proxy}).")
                return raw_text
            except:
                pass
            
            # Last resort: fetch raw and translate with Groq
            raw_text = " ".join([item.text for item in first_transcript.fetch()])
            translated_via_groq = get_translation_with_groq(raw_text)
            if translated_via_groq:
                print(f"✅ Translated via Groq LLM (cookies={use_cookies}, proxy={use_proxy}).")
                return translated_via_groq
                
        except Exception as e:
            print(f"❌ Configuration (cookies={use_cookies}, proxy={use_proxy}) failed: {e}")
            
    print("❌ All youtube-transcript-api fetch configurations failed.")
    return None

async def fetch_transcript_via_proxy(yt_id: str) -> str | None:
    """Fetch transcript using youtube-transcript-api routed through a residential proxy.
    YouTube blocks ALL cloud IPs (GCP, AWS, Cloudflare). Only residential proxies work.
    Set RESIDENTIAL_PROXY_URL env var e.g. http://user:pass@p.webshare.io:80
    """
    proxy_url = os.getenv("RESIDENTIAL_PROXY_URL")
    if not proxy_url:
        print("⚠️ RESIDENTIAL_PROXY_URL not set, skipping proxy fallback")
        return None
    
    try:
        print(f"🌐 Fetching transcript via residential proxy for {yt_id}...")
        client = YouTubeTranscriptApi(
            proxy_config=GenericProxyConfig(
                http_url=proxy_url,
                https_url=proxy_url,
            )
        )
        
        transcript_list = client.list(video_id=yt_id)
        transcripts_iter = list(transcript_list)
        if not transcripts_iter:
            raise Exception("No transcripts available via proxy")
        
        first_transcript = transcripts_iter[0]
        
        # Try direct English
        try:
            transcripts = transcript_list.find_transcript(['en', 'en-US', 'en-CA', 'en-GB', 'en-IN'])
            raw_text = " ".join([item.text for item in transcripts.fetch()])
            print("✅ English transcript fetched via proxy.")
            return raw_text
        except:
            pass
        
        # Try YouTube translation
        try:
            translated = first_transcript.translate('en')
            raw_text = " ".join([item.text for item in translated.fetch()])
            print("✅ Translated to English via proxy + YouTube.")
            return raw_text
        except:
            pass
        
        # Last resort: raw + Groq translation
        raw_text = " ".join([item.text for item in first_transcript.fetch()])
        translated_via_groq = get_translation_with_groq(raw_text)
        if translated_via_groq:
            print("✅ Translated via proxy + Groq LLM.")
            return translated_via_groq
        
        return None
    except Exception as e:
        print(f"❌ Residential proxy transcript fetch failed: {e}")
        return None

async def fetch_transcript_via_innertube(yt_id: str, cookie_path: str | None = None) -> str | None:
    """
    Fetch captions by scraping the YouTube watch page HTML.
    
    Approach: Load the watch page (which works from datacenter IPs with 
    consent cookies), parse ytInitialPlayerResponse to extract signed 
    caption URLs, then immediately fetch the caption content.
    
    This bypasses youtube-transcript-api and yt-dlp entirely.
    """
    proxy_url = os.getenv("RESIDENTIAL_PROXY_URL")
    
    # Try different request configurations:
    # 1. With cookies, without proxy (since proxy triggers cookie rejection)
    # 2. With cookies, with proxy (as fallback)
    # 3. Without cookies, with proxy
    # 4. Without cookies, without proxy
    
    configs = []
    if cookie_path and os.path.exists(cookie_path):
        configs.append({"use_cookies": True, "use_proxy": False})
        if proxy_url:
            configs.append({"use_cookies": True, "use_proxy": True})
    
    if proxy_url:
        configs.append({"use_cookies": False, "use_proxy": True})
    configs.append({"use_cookies": False, "use_proxy": False})
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    }
    
    for config in configs:
        use_cookies = config["use_cookies"]
        use_proxy = config["use_proxy"]
        print(f"🔌 Innertube: Trying fetch (cookies={use_cookies}, proxy={use_proxy})...")
        
        try:
            session = requests.Session()
            if use_proxy and proxy_url:
                session.proxies = {"http": proxy_url, "https": proxy_url}
            
            if use_cookies and cookie_path:
                cookie_jar = MozillaCookieJar(cookie_path)
                cookie_jar.load(ignore_discard=True, ignore_expires=True)
                session.cookies.update(cookie_jar)
            else:
                session.cookies.set('CONSENT', 'YES+cb', domain='.youtube.com')
                session.cookies.set('SOCS', 'CAESEwgDEgk3ODE3NjY4MTIaAmVuIAEaBgiA_LyaBg', domain='.youtube.com')
                
            page_resp = session.get(
                f'https://www.youtube.com/watch?v={yt_id}',
                headers=headers,
                timeout=12
            )
            
            if page_resp.status_code != 200:
                print(f"  ⚠️ Watch page returned {page_resp.status_code}")
                continue
                
            page_text = page_resp.text
            
            if 'confirm you' in page_text.lower() and 'not a bot' in page_text.lower():
                print("  ❌ YouTube bot detection triggered on watch page")
                continue
                
            # Extract player response
            import re as _re
            import json as _json
            
            match = _re.search(r'ytInitialPlayerResponse\s*=\s*(\{.+?\});', page_text)
            if not match:
                match = _re.search(r'ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;', page_text)
                
            player_data = None
            if match:
                try:
                    player_data = _json.loads(match.group(1))
                except Exception:
                    pass
                    
            if not player_data:
                # Try brace matching from the first occurrence of ytInitialPlayerResponse
                idx = page_text.find('ytInitialPlayerResponse')
                if idx != -1:
                    start_idx = page_text.find('{', idx)
                    if start_idx != -1:
                        brace_count = 0
                        for i in range(start_idx, len(page_text)):
                            if page_text[i] == '{':
                                brace_count += 1
                            elif page_text[i] == '}':
                                brace_count -= 1
                                if brace_count == 0:
                                    try:
                                        player_data = _json.loads(page_text[start_idx:i+1])
                                        break
                                    except Exception:
                                        pass
                                        
            if not player_data:
                print("  ❌ Could not parse ytInitialPlayerResponse in page")
                continue
                
            playability = player_data.get('playabilityStatus', {})
            status = playability.get('status')
            if status != 'OK':
                reason = playability.get('reason', 'Unknown')
                print(f"  ⚠️ Video not playable (cookies={use_cookies}, proxy={use_proxy}): {status} - {reason}")
                continue
                
            captions_data = player_data.get('captions', {})
            renderer = captions_data.get('playerCaptionsTracklistRenderer', {})
            caption_tracks = renderer.get('captionTracks', [])
            
            if not caption_tracks:
                print("  ⚠️ No caption tracks found in player response")
                continue
                
            print(f"  📋 Found {len(caption_tracks)} caption track(s)")
            
            target_track = None
            is_english = False
            for track in caption_tracks:
                lang = track.get('languageCode', '')
                if lang.startswith('en'):
                    target_track = track
                    is_english = True
                    break
                    
            if not target_track:
                target_track = caption_tracks[0]
                print(f"  🌐 No English track. Using {target_track.get('languageCode', '?')}")
                
            base_url = target_track.get('baseUrl')
            if not base_url:
                print("  ⚠️ No baseUrl in caption track")
                continue
                
            fetch_url = base_url
            if not is_english:
                fetch_url += '&tlang=en'
                
            caption_resp = session.get(fetch_url, headers=headers, timeout=10)
            if caption_resp.status_code != 200:
                print(f"  ⚠️ Caption fetch returned {caption_resp.status_code}")
                if not is_english and '&tlang=en' in fetch_url:
                    caption_resp = session.get(base_url, headers=headers, timeout=10)
                    if caption_resp.status_code != 200:
                        continue
                    is_english = False
                else:
                    continue
                    
            caption_text = caption_resp.text.strip()
            if not caption_text or caption_text.startswith('<html'):
                print("  ⚠️ Got HTML instead of caption XML")
                continue
                
            from xml.etree import ElementTree
            import html as _html
            root = ElementTree.fromstring(caption_text)
            texts = []
            for elem in root.iter('text'):
                if elem.text:
                    texts.append(_html.unescape(elem.text))
                    
            if not texts:
                continue
                
            transcript = " ".join(texts)
            if not is_english:
                print("  🌐 Translating non-English transcript via Groq...")
                translated = get_translation_with_groq(transcript)
                if translated:
                    return translated
                    
            return transcript
            
        except Exception as e:
            print(f"  ❌ Config (cookies={use_cookies}, proxy={use_proxy}) failed: {e}")
            
    print("❌ All Innertube fetch configs failed.")
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