FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y curl nodejs npm && rm -rf /var/lib/apt/lists/*

# Copy backend requirements
COPY apps/server/requirements.txt ./apps/server/requirements.txt
RUN pip install --no-cache-dir -r apps/server/requirements.txt

# Copy backend source code and db schema
COPY apps/server ./apps/server
COPY packages/db ./packages/db

WORKDIR /app/apps/server

# Fix the Prisma Python provider path to work outside of virtual environments
RUN sed -i 's|provider *= *".*/.venv/bin/prisma-client-py"|provider = "prisma-client-py"|g' ../../packages/db/prisma/schema.prisma

# Generate Prisma client for Python
RUN prisma generate --schema=../../packages/db/prisma/schema.prisma

# Expose port
EXPOSE 8000

# Start Uvicorn
CMD ["python", "-m", "uvicorn", "main.main:app", "--host", "0.0.0.0", "--port", "8000"]
