from core.db import prisma_client as db
from core.logging import get_logger
import os
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import HumanMessage, AIMessage
from dotenv import load_dotenv
from rag.retrieval import retrive_chunks
import groq

logger = get_logger("retrieval_chain")
load_dotenv()

async def get_session_metadata(session_id: str):
    try:
        jobs = await db.job.find_many(
            where={
                "session_id": session_id
            }
        )
        return jobs
    except Exception as e:
        logger.error(f"Error in getting session metadata: {e}", exc_info=True)
        return []
def build_system_prompt(metadata: list, chunks: list):
    video_lines = []
    for job in metadata:
        line = (
            f"- Video {job.label} by {job.creator}"
            f"{'| Platform: ' + job.platform + ' ' if job.platform else ''}"
            f"| Views: {job.views or 'N/A'} | Likes: {job.likes or 'N/A'} "
            f"| Comments: {job.comments or 'N/A'} "
            f"| Engagement Rate: {job.engagement_rate or 'N/A'}% (FORMULA: (likes + comments) / views × 100.0)"
            f"| Duration: {job.duration or 'N/A'}s "
            f"| Followers: {job.follower_count or 'N/A'} "
            f"| Hashtags: {', '.join(job.hashtags) if job.hashtags else 'None'}"
        )
        video_lines.append(line)

    metadata_section = "\n".join(video_lines)

    chunk_lines = []
    for c in chunks:
        chunk_lines.append(
            f"**Video {c['label']} [Chunk {c['chunk_index']} of {c.get('max_chunk', '?')}]**: {c['content']}"
        )
    
    chunks_section = "\n".join(chunk_lines) if chunk_lines else "NO RELEVANT INFORMATION WAS FOUND"

    return f"""
        You are a highly analytical social media video consultant. Your sole purpose is to analyze the provided metadata and transcripts to answer the user's question accurately.

        # 📊 EXACT VIDEO METADATA
        {metadata_section}

        # 📝 RELEVANT TRANSCRIPT CHUNKS (Context)
        {chunks_section}

        # 🎯 STRICT INSTRUCTIONS
        1. **Data Primacy**: Never hallucinate numbers. If a user asks for views, likes, or engagement rate, pull the EXACT number from the VIDEO METADATA section.
        2. **Content Extraction**: If asked about the "hook", "CTA (Call to Action)", or specific phrasing, quote directly from the TRANSCRIPT CHUNKS. Do not invent dialogue.
        3. **Clear Citations**: Always explicitly name the video when referencing it (e.g., "In **Video A** by CreatorX...").
        4. **Comparative Analysis**: If comparing multiple videos, explicitly contrast their metrics (e.g., "Video A had 5% higher engagement than Video B because...").
        5. **Handling Missing Info**: If the context provided does not contain the answer, explicitly state: "I don't have enough information in the provided transcripts to answer that." Do not guess.
        6. **Tone**: Direct, professional, insightful, and concise. Avoid fluff.
        7. **Positional Awareness**: Chunks are labeled with their timeline position [Chunk N of M]. Chunk 0 is the opening hook. The highest chunk is the ending/CTA. Use this context to reason about pacing and structural flow.
    """

async def get_chat_history(session_id: str):
    try:
        messages = await db.message.find_many(
            where={ "session_id": session_id},
            order={ "created_at": "asc"},
            take=20
        ) 
        chat_history = []
        for msg in messages:
            if msg.role == "USER":
                chat_history.append(HumanMessage(content=msg.content))
            else: 
                chat_history.append(AIMessage(content=msg.content))
        return chat_history
    except Exception as e:
        logger.error(f"Error in getting chat history: {e}", exc_info=True)
        return []
llm = ChatGroq(
    model="qwen/qwen3.6-27b",
    api_key=os.getenv("GROQ_API"),
    temperature=0.3,
    streaming=True,
)

prompt = ChatPromptTemplate.from_messages([
    ('system', '{system_prompt}'), 
    MessagesPlaceholder('chat_history'),
    ('human', '{question}')
])

chain = prompt | llm    

async def stream_chat(question: str, session_id: str, focus_job_id: str = None):

    chat_history = await get_chat_history(session_id)

    jobs = await get_session_metadata(session_id) 
    if focus_job_id:
        jobs = [job for job in jobs if job.id == focus_job_id]

    chunks = await retrive_chunks(question, session_id, focus_job_id)   

    system_prompt = build_system_prompt(jobs, chunks) 

    try:
        async for token in chain.astream({
            "system_prompt": system_prompt,
            'chat_history': chat_history,
            'question': question
        }):
            yield token.content
    except groq.RateLimitError as e:
        logger.warning(f"Groq RateLimitError in stream_chat: {e}", extra={"session_id": session_id})
        yield "\n\n**Error:** The AI is currently experiencing heavy load (Rate Limited). Please wait a moment and try again."
    except groq.APIError as e:
        logger.error(f"Groq APIError in stream_chat: {e}", exc_info=True, extra={"session_id": session_id})
        yield "\n\n**Error:** An issue occurred with the AI provider. Please try again later."
    except Exception as e:
        logger.error(f"Unexpected error in stream_chat: {e}", exc_info=True, extra={"session_id": session_id})
        yield f"\n\n**Error:** Something went wrong generating the response."
