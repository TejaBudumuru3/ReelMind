from prisma_db import Prisma
import os
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import HumanMessage, AIMessage
from dotenv import load_dotenv
from rag.retrieval import retrive_chunks
load_dotenv()

async def get_session_metadata(session_id: str):
    try:
        db = Prisma()
        await db.connect()

        jobs = await db.job.find_many(
            where={
                "session_id": session_id
            }
        )
        return jobs
    except Exception as e:
        print(f"Error in getting session metadata: {e}")
        return []
    finally:
        await db.disconnect()

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
            f"[Video {c['label']}, Chunk {c['chunk_index']}]: {c['content']}"
        )
    
    chunks_section = "\n".join(chunk_lines) if chunk_lines else "NO RELEVANT INFORMATION WAS FOUND"

    return f"""
        You are a social media video analyst for creators. You have access to metadata and transcripts from videos in this session.

        VIDEO METADATA:
        {metadata_section}

        RELEVANT TRANSCRIPT CHUNKS:
        {chunks_section}

        INSTRUCTIONS:
        - When answering about engagement, views, likes, or comments, use the VIDEO METADATA above. These are exact numbers.
        - When answering about content, hooks, structure, or what was said, use the TRANSCRIPT CHUNKS above.
        - Always cite your source as [Video X, Chunk Y] when referencing transcript content.
        - For comparison questions, analyze both videos and provide specific differences.
        - For single-video questions, focus on that specific video only.
        - Be specific and data-driven. Avoid generic advice.
        - If the transcript chunks don't contain enough information to answer, say so honestly rather than making things up.

    """

async def get_chat_history(session_id: str):
    db = Prisma()
    await db.connect()

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
        print(f"Error in getting chat history: {e}")
        return []
    finally:
        await db.disconnect()

llm = ChatGroq(
    model="llama-3.3-70b-versatile",
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

async def stream_chat(question: str, session_id: str, ):

    chat_history = await get_chat_history(session_id)

    jobs = await get_session_metadata(session_id) 

    chunks = await retrive_chunks(question, session_id)   

    system_prompt = build_system_prompt(jobs, chunks) 

    

    async for token in chain.astream({
        "system_prompt": system_prompt,
        'chat_history': chat_history,
        'question': question
    }):
        yield token.content

    
