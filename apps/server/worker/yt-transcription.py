from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api import formatters
import json
import yt_dlp
from decimal import Decimal

URL = 'https://www.youtube.com/watch?v=AHGG7LHi07E'

def extract_social_metadata(url: str) -> dict:
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'extract_flat': False,
        'cookiefile': "/mnt/p/ReelMind/apps/server/worker/cookies.txt" # Add this for local testing
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            
            # 🚨 THE DEBUG DUMP: Print the first 50 keys to see what we actually got
            print("🔥 RAW KEYS:", list(info.keys())[:50])
            
            # If it's a playlist/series link, the data is hidden inside 'entries'
            if 'entries' in info:
                print("⚠️ Detected a playlist/series URL instead of a single video.")
                info = info['entries'][0] # Grab the first video's data
            
            views = info.get('view_count') or 0
            likes = info.get('like_count') or 0
            comments = info.get('comment_count') or 0
            
            print(f"📊 EXTRACTED -> Views: {views}, Likes: {likes}, Comments: {comments}")
            
            engagement_rate = 0.00
            if views > 0:
                engagement = ((likes + comments) / views) * 100
                engagement_rate = round(engagement, 2)
                
            return {
                "views": views,
                "likes": likes,
                "comments": comments,
                "engagement_rate": Decimal(str(engagement_rate))
            }
    except Exception as e:
        print(f"Metadata extraction failed: {e}")
        return {"views": 0, "likes": 0, "comments": 0, "engagement_rate": Decimal("0.00")}
info = extract_social_metadata(URL)
with open('video_info.json', 'w') as f:
    json.dump(info, f)

yt_api = YouTubeTranscriptApi()

transcription = yt_api.fetch(video_id="AHGG7LHi07E", languages=['en', 'hi', 'us-en'])
transcriptionList = yt_api.list("AHGG7LHi07E")
print(f"\n available transcritions : {transcriptionList}")
transcription_dict = [dict(item) for item in transcription]
with open('transcription.json', 'w') as f:
    json.dump(transcription_dict, f, default=str)

# formatted = formatters.Formatter().format_transcript(transcription, indent=2)
# print(transcription)
