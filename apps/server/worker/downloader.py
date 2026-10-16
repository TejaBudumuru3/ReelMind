import os
import yt_dlp
from typing import List, Dict, Any, Optional
from worker.ingest import get_cookies_file_path
from core.logging import get_logger

logger = get_logger("downloader")

def get_ydl_opts(extra_opts: Optional[dict] = None) -> dict:
    opts = {
        'quiet': True,
        'no_warnings': True,
        'skip_download': True,
        'extract_flat': False,
    }
    
    proxy_url = os.getenv("RESIDENTIAL_PROXY_URL")
    if proxy_url:
        opts['proxy'] = proxy_url

    if extra_opts:
        opts.update(extra_opts)
    return opts

def extract_download_formats(url: str) -> Dict[str, Any]:
    """
    Probes video metadata and extracts distinct quality profiles without downloading media.
    """
    ydl_opts = get_ydl_opts()
    opts_direct = ydl_opts.copy()
    opts_direct.pop('proxy', None)

    try:
        with yt_dlp.YoutubeDL(opts_direct) as ydl:
            info = ydl.extract_info(url, download=False)
    except Exception as direct_err:
        proxy_url = os.getenv("RESIDENTIAL_PROXY_URL")
        if proxy_url:
            logger.warning(f"Direct probe failed, retrying via proxy: {direct_err}")
            opts_proxy = ydl_opts.copy()
            opts_proxy['proxy'] = proxy_url
            try:
                with yt_dlp.YoutubeDL(opts_proxy) as ydl_proxy:
                    info = ydl_proxy.extract_info(url, download=False)
            except Exception:
                raise direct_err
        else:
            raise direct_err

    if 'entries' in info and info['entries']:
        info = info['entries'][0]

    if info.get('is_live'):
        raise ValueError("Live streams are not supported.")

    title = info.get('title', 'video')
    thumbnail = info.get('thumbnail')
    duration = info.get('duration')
    raw_formats = info.get('formats', [])

    categorized_formats: List[Dict[str, Any]] = []
    seen_resolutions = set()
    audio_added = False

    # 1. Studio Quality Audio (48 kHz Opus / Best AAC)
    audio_candidates = [
        f for f in raw_formats 
        if f.get('vcodec') == 'none' and f.get('acodec') != 'none'
    ]
    
    # Sort audio by bitrate descending
    audio_candidates.sort(key=lambda x: x.get('tbr') or x.get('abr') or 0, reverse=True)

    def compute_size_mb(f: dict) -> Optional[float]:
        sz = f.get('filesize') or f.get('filesize_approx')
        if not sz and duration:
            rate = f.get('tbr') or f.get('vbr') or f.get('abr')
            if rate:
                sz = (rate * 1024 / 8) * duration
        return round(sz / (1024 * 1024), 1) if sz else None

    for af in audio_candidates:
        asr = af.get('asr') or 44100
        abr = af.get('abr') or af.get('tbr') or 128
        ext = af.get('ext') or 'm4a'
        f_id = af.get('format_id')
        
        is_opus_48k = 'opus' in (af.get('acodec') or '').lower() or asr == 48000
        label = f"Studio Audio ({asr // 1000} kHz • {round(abr)} kbps)" if is_opus_48k else f"High Quality Audio ({ext.upper()} • {round(abr)} kbps)"
        filesize_mb = compute_size_mb(af)

        categorized_formats.append({
            'format_id': f_id,
            'type': 'audio',
            'label': label,
            'quality': f"{asr // 1000} kHz",
            'ext': ext,
            'filesize_mb': filesize_mb,
            'has_audio': True,
            'has_video': False,
            'note': 'Studio-grade uncompressed sample rate' if is_opus_48k else 'Compatible audio stream'
        })
        if len([c for c in categorized_formats if c['type'] == 'audio']) >= 2:
            break

    # 2. All Video Formats (Grouped by resolution from 4K down to 360p)
    all_videos = [
        f for f in raw_formats 
        if f.get('vcodec') != 'none' and f.get('height')
    ]
    # Sort: prefer combined (audio+video), then resolution descending, then bitrate descending
    all_videos.sort(
        key=lambda x: (
            1 if x.get('acodec') != 'none' else 0,
            x.get('height') or 0,
            x.get('tbr') or x.get('vbr') or 0
        ),
        reverse=True
    )

    # Resolution buckets to detect: 2160 (4K), 1440 (2K), 1080 (FHD), 720 (HD), 480 (SD), 360 (SD)
    for vf in all_videos:
        h = vf.get('height')
        if not h:
            continue
            
        # Match standard resolution bucket
        bucket = 2160 if h >= 2160 else (1440 if h >= 1440 else (1080 if h >= 1080 else (720 if h >= 720 else (480 if h >= 480 else 360))))
        if bucket in seen_resolutions:
            continue
        seen_resolutions.add(bucket)

        has_audio = vf.get('acodec') != 'none'
        filesize_mb = compute_size_mb(vf)
        ext = vf.get('ext') or 'mp4'

        if bucket >= 2160:
            prefix = "4K Ultra HD"
        elif bucket >= 1440:
            prefix = "2K Quad HD"
        elif bucket >= 1080:
            prefix = "1080p Full HD"
        elif bucket >= 720:
            prefix = "720p HD"
        elif bucket >= 480:
            prefix = "480p SD"
        else:
            prefix = "360p Standard"

        if has_audio:
            categorized_formats.append({
                'format_id': vf.get('format_id'),
                'type': 'video_combined',
                'label': f"{prefix} ({bucket}p • Video + Audio)",
                'quality': f"{bucket}p",
                'ext': ext,
                'filesize_mb': filesize_mb,
                'has_audio': True,
                'has_video': True,
                'note': 'Direct stream with synchronized audio'
            })
        else:
            categorized_formats.append({
                'format_id': vf.get('format_id'),
                'type': 'video_hd',
                'label': f"{prefix} ({bucket}p • Visual Only)",
                'quality': f"{bucket}p",
                'ext': ext,
                'filesize_mb': filesize_mb,
                'has_audio': False,
                'has_video': True,
                'note': 'Pristine visual b-roll stream (No Audio)'
            })

    # 3. Universal Fallback for Single-Stream & Direct Media (CDNs, direct MP4, generic extractors)
    if not categorized_formats and raw_formats:
        for f in raw_formats[:2]:
            f_id = f.get('format_id') or 'direct'
            ext = f.get('ext') or 'mp4'
            filesize_mb = compute_size_mb(f)
            h = f.get('height')
            quality_str = f"{h}p" if h else "Source"
            categorized_formats.append({
                'format_id': f_id,
                'type': 'video_combined',
                'label': f"Original Quality ({ext.upper()} • {quality_str})",
                'quality': quality_str,
                'ext': ext,
                'filesize_mb': filesize_mb,
                'has_audio': True,
                'has_video': True,
                'note': 'Direct source stream'
            })

    return {
        'title': title,
        'thumbnail': thumbnail,
        'duration': duration,
        'formats': categorized_formats
    }

def get_direct_stream_info(url: str, format_id: str) -> Dict[str, Any]:
    """
    Retrieves the direct CDN URL and headers for a specific format ID.
    """
    ydl_opts = get_ydl_opts({'format': format_id})
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        try:
            info = ydl.extract_info(url, download=False)
        except Exception as e:
            logger.warning(f"Direct stream probe failed with proxy, retrying direct: {e}")
            opts_no_proxy = ydl_opts.copy()
            opts_no_proxy.pop('proxy', None)
            with yt_dlp.YoutubeDL(opts_no_proxy) as ydl_direct:
                info = ydl_direct.extract_info(url, download=False)
        if 'entries' in info and info['entries']:
            info = info['entries'][0]

    title = info.get('title', 'reelmind_media')
    selected_format = None
    for f in info.get('formats', []):
        if str(f.get('format_id')) == str(format_id):
            selected_format = f
            break

    if not selected_format:
        # Fallback to direct url on info
        selected_format = info

    stream_url = selected_format.get('url')
    if not stream_url:
        raise ValueError("Could not resolve CDN stream URL for format.")

    ext = selected_format.get('ext') or 'mp4'
    http_headers = selected_format.get('http_headers') or {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }

    return {
        'stream_url': stream_url,
        'title': title,
        'ext': ext,
        'headers': http_headers
    }

async def stream_ytdlp_process(url: str, format_id: str, chunk_size: int = 65536):
    """
    Spawns yt-dlp to stream raw media chunks directly from platform CDN to stdout.
    Bypasses CDN hotlinking/IP-locking restrictions with zero server disk buffering.
    """
    import sys
    import asyncio
    python_exe = sys.executable
    cmd = [
        python_exe, '-m', 'yt_dlp',
        '-f', str(format_id),
        '--no-progress',
        '--no-warnings',
        '--quiet',
        '-o', '-',
        url
    ]
    
    import subprocess
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        bufsize=chunk_size
    )

    try:
        while True:
            chunk = await asyncio.to_thread(proc.stdout.read, chunk_size)
            if not chunk:
                break
            yield chunk
        await asyncio.to_thread(proc.wait)
    except Exception as e:
        logger.error(f"Error while streaming yt-dlp process: {e}")
        try:
            proc.kill()
        except:
            pass
        raise
    finally:
        if proc.poll() is None:
            try:
                proc.kill()
            except:
                pass

