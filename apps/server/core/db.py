import os
import asyncpg
from prisma_db import Prisma

# Global Singletons
prisma_client = Prisma()
pg_pool = None

async def init_db():
    global pg_pool
    
    # Connect Prisma once
    if not prisma_client.is_connected():
        await prisma_client.connect()
    
    # Create asyncpg pool once
    db_url = os.getenv("DATABASE_URL")
    if db_url:
        pg_pool = await asyncpg.create_pool(
            db_url,
            min_size=2,
            max_size=20,
            command_timeout=60
        )
    else:
        print("WARNING: DATABASE_URL not set. Asyncpg pool not created.")

async def close_db():
    global pg_pool
    if prisma_client.is_connected():
        await prisma_client.disconnect()
    if pg_pool:
        await pg_pool.close()
