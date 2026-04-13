from fastapi import APIRouter, Depends, HTTPException, Body
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
import json
import asyncio

try:
    from .. import models, schemas, llm
    from ..database import get_db
except ImportError:
    import models, schemas, llm
    from database import get_db

router = APIRouter(prefix="/paraclete", tags=["paraclete"])

class ChatRequest(BaseModel):
    messages: List[Dict[str, str]]
    context: Optional[Dict[str, Any]] = None

@router.post("/chat")
async def paraclete_chat(
    request: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db)
):
    """
    Paraclete Interactive Chat. 
    Maintains a conversation with the assistant about the practitioner's workspace.
    """
    user_messages = request.get("messages", [])
    
    # 1. Build Workspace Context
    # We provide a high-level summary of the system state so the LLM knows what's going on.
    person_count = db.query(models.Person).count()
    group_count = db.query(models.Group).count()
    note_count = db.query(models.Note).count()
    pending_proposals = db.query(models.FrameworkProposal).filter(models.FrameworkProposal.status == "PENDING").count()
    
    # Get active entities (last 3 accessed/created)
    recent_notes = db.query(models.Note).order_by(models.Note.updated_at.desc()).limit(3).all()
    recent_context = "\n".join([f"- Note: {n.title} ({n.date})" for n in recent_notes])

    system_prompt = f"""You are Paraclete, an intelligent AI companion for professional practitioners.
Your goal is to assist with note-taking, framework extraction, message drafting, and workspace management.

WORKSPACE STATE:
- People Tracked: {person_count}
- Groups: {group_count}
- Total Notes: {note_count}
- Pending Framework Proposals: {pending_proposals}

RECENT ACTIVITY:
{recent_context}

INSTRUCTIONS:
- You are professional, insightful, and concise.
- You can help the user navigate their practice or understand their framework.
- If the user asks about a specific person or note, check the context provided or ask for clarification.
- You operate locally on the practitioner's hardware, prioritizing privacy.
"""

    messages = [{"role": "system", "content": system_prompt}] + user_messages

    from ..websockets_manager import ws_manager
    await ws_manager.broadcast({"event": "llm_start", "data": {"type": "chat", "prompt": "Paraclete is thinking..."}})

    async def generate_chat():
        # Using a thread because llama-cpp-python's streaming in chat completion 
        # is synchronous iterative in the generator.
        try:
            # We use the raw generate or chat_completion with stream=True
            response_iter = await asyncio.to_thread(
                llm.llm_manager.model.create_chat_completion,
                messages=messages,
                stream=True,
                max_tokens=1024,
                stop=["<turn|>", "<eos>"]
            )
            
            for chunk in response_iter:
                delta = chunk["choices"][0].get("delta", {})
                if "content" in delta:
                    yield delta["content"]
            
            await ws_manager.broadcast({"event": "llm_finish", "data": {"type": "chat"}})
        except Exception as e:
            await ws_manager.broadcast({"event": "llm_error", "data": str(e)})
            yield f"Error: {str(e)}"

    return StreamingResponse(generate_chat(), media_type="text/plain")
