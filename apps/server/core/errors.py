from core.logging import get_logger

logger = get_logger("errors")

def sanitize_error(exc: Exception | str) -> str:
    """
    Sanitizes raw backend/yt-dlp/API errors into polished, professional user-facing copy.
    Ensures internal technical jargon, CLI stack traces, and API keys are never exposed.
    """
    raw = str(exc)
    raw_lower = raw.lower()

    # Log raw exception details on server console
    logger.error(f"[RAW ERROR TRACE]: {raw}")

    # Live Streams
    if "live stream" in raw_lower or "is_live" in raw_lower:
        return "Live streams are not supported. Please provide a link to a recorded video or clip."

    # No Spoken Dialogue / Voice Detected (Silent animations, instrumental music)
    if "no spoken voice" in raw_lower or "no speech" in raw_lower or "empty transcript" in raw_lower:
        return "No spoken dialogue detected. ReelMind is designed for spoken-word videos (lectures, tutorials, podcasts). Please try a video with conversational speech."

    # Payload Size Exceeded (Groq Whisper 25 MB Limit)
    if "413" in raw_lower or "too large" in raw_lower or "request_too_large" in raw_lower or "exceeds the 25 mb" in raw_lower:
        return "The audio payload for this video exceeds our 25 MB processing limit. Please use a shorter clip or a video with subtitle captions."

    # Platform Authentication / Login / Cookies Required (X, Instagram, Patreon, Members-only, etc.)
    auth_keywords = [
        "login required", "sign in", "requires authentication", "could not authenticate",
        "account is required", "cookie", "members-only", "subscribers only",
        "unauthorized", "401", "authentication required"
    ]
    if any(k in raw_lower for k in auth_keywords):
        return "This platform is temporarily busy or requires an authenticated account. Please try another public link or platform."

    # YouTube Bot Protection / 403 Forbidden
    if "sign in to confirm you're not a bot" in raw_lower or "bot protection" in raw_lower or "403" in raw_lower:
        return "YouTube is temporarily restricting automated access for this video. Please try again shortly or try an alternative video."

    # Unsupported URL or Non-Video Webpage
    if "unsupported url" in raw_lower or "no video" in raw_lower or "no video formats found" in raw_lower or "unable to extract" in raw_lower:
        return "No downloadable video stream was detected at this link. Please ensure it points directly to public media."

    # Video Duration Cap
    if "duration" in raw_lower and ("exceed" in raw_lower or "15 minute" in raw_lower or "900" in raw_lower):
        return "This video exceeds our 15-minute analysis limit. Please provide a shorter clip or reel."

    # Private or Deleted Videos
    if "private video" in raw_lower or "this video is private" in raw_lower or "video unavailable" in raw_lower or "not found" in raw_lower:
        return "The requested video is private, restricted, or no longer available on the source platform."

    # Rate Limiting & Quotas (Groq / Jina / Ingest)
    if "429" in raw_lower or "rate limit" in raw_lower or "quota" in raw_lower:
        return "Analysis capacity is temporarily congested due to high demand. Please wait a moment and try again."

    # Network / Timeout
    if "timed out" in raw_lower or "timeout" in raw_lower or "connection" in raw_lower:
        return "We encountered a network timeout while connecting to the source platform. Please retry in a few moments."

    # General Fallback
    return "We were unable to complete the analysis for this link. Please verify the URL and try again."
