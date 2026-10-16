import os
from dotenv import load_dotenv

load_dotenv()

# LLM Models & Embeddings configuration
GROQ_CHAT_MODEL = os.getenv("GROQ_CHAT_MODEL", "qwen/qwen3.8-27b")
GROQ_WHISPER_MODEL = os.getenv("GROQ_WHISPER_MODEL", "whisper-large-v3")
GROQ_TRANSLATION_MODEL = os.getenv("GROQ_TRANSLATION_MODEL", "qwen/qwen3.8-27b")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "jina-embeddings-v3")
EMBEDDING_DIMENSION = int(os.getenv("EMBEDDING_DIMENSION", "1024"))

# Media Download Feature Flag (Disable on Cloud Run to enforce $0.00 egress)
ENABLE_MEDIA_DOWNLOADS = os.getenv("ENABLE_MEDIA_DOWNLOADS", "false").lower() == "true"
