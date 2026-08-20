from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from fastapi import Request

# Use in-memory storage for rate limiting. 
# In a true multi-worker production environment, you'd configure this with RedisStorage.
limiter = Limiter(key_func=get_remote_address)
