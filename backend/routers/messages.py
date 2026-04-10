from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from datetime import datetime
import asyncio
import json

from .. import models, schemas, database, llm
from ..database import get_db

router = APIRouter(
    prefix="/messages",
    tags=["messages"]
)

@router.get("/", response_model=List[schemas.Message])
def read_messages(
    skip: int = 0, 
    limit: int = 100, 
    status: Optional[schemas.MessageStatus] = None,
    person_id: Optional[int] = None,
    group_id: Optional[int] = None,
    note_id: Optional[int] = None,
    date: Optional[str] = Query(None, description="YYYY-MM-DD format"),
    db: Session = Depends(get_db)
):
    query = db.query(models.Message).options(
        joinedload(models.Message.note),
        joinedload(models.Message.person),
        joinedload(models.Message.group),
        joinedload(models.Message.persona)
    )
    
    if status:
        query = query.filter(models.Message.status == status)
    if person_id:
        query = query.filter(models.Message.person_id == person_id)
    if group_id:
        query = query.filter(models.Message.group_id == group_id)
    if note_id:
        query = query.filter(models.Message.note_id == note_id)
    if date:
        query = query.filter(models.Message.date == date)
        
    return query.order_by(models.Message.created_at.desc()).offset(skip).limit(limit).all()

@router.get("/by-date/{date_str}", response_model=List[schemas.Message])
def read_messages_by_date(date_str: str, db: Session = Depends(get_db)):
    return db.query(models.Message).options(
        joinedload(models.Message.note),
        joinedload(models.Message.person),
        joinedload(models.Message.group)
    ).filter(models.Message.date == date_str).order_by(models.Message.created_at.desc()).all()

@router.get("/{message_id}", response_model=schemas.Message)
def read_message(message_id: int, db: Session = Depends(get_db)):
    db_msg = db.query(models.Message).options(
        joinedload(models.Message.note),
        joinedload(models.Message.person),
        joinedload(models.Message.group),
        joinedload(models.Message.persona)
    ).filter(models.Message.id == message_id).first()
    if not db_msg:
        raise HTTPException(status_code=404, detail="Message not found")
    return db_msg

@router.patch("/{message_id}", response_model=schemas.Message)
def update_message(message_id: int, msg_update: schemas.MessageUpdate, db: Session = Depends(get_db)):
    db_msg = db.query(models.Message).filter(models.Message.id == message_id).first()
    if not db_msg:
        raise HTTPException(status_code=404, detail="Message not found")
    
    update_data = msg_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_msg, key, value)
    
    db.commit()
    db.refresh(db_msg)
    return db_msg

@router.post("/", response_model=schemas.Message)
def create_message(msg: schemas.MessageCreate, db: Session = Depends(get_db)):
    db_msg = models.Message(**msg.model_dump())
    db.add(db_msg)
    db.commit()
    db.refresh(db_msg)
    return db_msg

class MessageIterateRequest(schemas.BaseModel):
    feedback: str
    highlight_text: Optional[str] = None

@router.post("/{message_id}/iterate")
async def iterate_message(
    message_id: int, 
    request: MessageIterateRequest,
    db: Session = Depends(get_db)
):
    feedback = request.feedback
    highlight_text = request.highlight_text
    db_msg = db.query(models.Message).options(joinedload(models.Message.note)).filter(models.Message.id == message_id).first()
    if not db_msg:
        raise HTTPException(status_code=404, detail="Message not found")
    
    # Gather context
    note_context = ""
    if db_msg.note:
        note_context = f"CONTEXT NOTE:\n{db_msg.note.title}\n{db_msg.note.cleaned_text or db_msg.note.raw_capture}"
    
    current_draft = db_msg.draft_text
    
    prompt = f"""You are an expert professional assistant. You are refining a message to a client or colleague.
    
    {note_context}
    
    CURRENT DRAFT:
    {current_draft}
    
    USER FEEDBACK:
    {feedback}
    """
    
    if highlight_text:
        prompt += f"\nSPECIFIC FOCUS ON THIS SECTION:\n{highlight_text}"
        
    prompt += "\n\nPlease provide an updated draft of the message based on this feedback."
    
    try:
        new_draft = await llm.llm_manager.call(prompt=prompt)
        db_msg.draft_text = new_draft
        db.commit()
        return {"draft_text": new_draft}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
