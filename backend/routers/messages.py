from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from datetime import datetime
import asyncio
import json

from .. import models, schemas, database, llm
from ..database import get_db
from ..services.framework_resolver import resolve_framework_items

router = APIRouter(prefix="/messages", tags=["messages"])


@router.get("/", response_model=List[schemas.Message])
def read_messages(
    skip: int = 0,
    limit: int = 100,
    status: Optional[schemas.MessageStatus] = None,
    person_id: Optional[int] = None,
    group_id: Optional[int] = None,
    note_id: Optional[int] = None,
    date: Optional[str] = Query(None, description="YYYY-MM-DD format"),
    db: Session = Depends(get_db),
):
    query = db.query(models.Message).options(
        joinedload(models.Message.note),
        joinedload(models.Message.person),
        joinedload(models.Message.group),
        joinedload(models.Message.persona),
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

    return (
        query.order_by(models.Message.created_at.desc()).offset(skip).limit(limit).all()
    )


@router.get("/by-date/{date_str}", response_model=List[schemas.Message])
def read_messages_by_date(date_str: str, db: Session = Depends(get_db)):
    return (
        db.query(models.Message)
        .options(
            joinedload(models.Message.note),
            joinedload(models.Message.person),
            joinedload(models.Message.group),
        )
        .filter(models.Message.date == date_str)
        .order_by(models.Message.created_at.desc())
        .all()
    )


@router.get("/{message_id}", response_model=schemas.Message)
def read_message(message_id: int, db: Session = Depends(get_db)):
    db_msg = (
        db.query(models.Message)
        .options(
            joinedload(models.Message.note),
            joinedload(models.Message.person),
            joinedload(models.Message.group),
            joinedload(models.Message.persona),
        )
        .filter(models.Message.id == message_id)
        .first()
    )
    if not db_msg:
        raise HTTPException(status_code=404, detail="Message not found")
    return db_msg


@router.patch("/{message_id}", response_model=schemas.Message)
def update_message(
    message_id: int, msg_update: schemas.MessageUpdate, db: Session = Depends(get_db)
):
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
    highlighted_text: Optional[str] = None  # Support both variants


@router.post("/{message_id}/iterate")
async def iterate_message(
    message_id: int, request: MessageIterateRequest, db: Session = Depends(get_db)
):
    feedback = request.feedback
    highlight_text = request.highlight_text or request.highlighted_text
    db_msg = (
        db.query(models.Message)
        .options(
            joinedload(models.Message.note),
            joinedload(models.Message.person),
            joinedload(models.Message.group),
        )
        .filter(models.Message.id == message_id)
        .first()
    )

    if not db_msg:
        raise HTTPException(status_code=404, detail="Message not found")

    # Gather context
    note_context = ""
    if db_msg.note:
        note_context = f"CONTEXT NOTE:\n{db_msg.note.title}\n{db_msg.note.cleaned_text or db_msg.note.raw_capture}"

    person_name = "Friend"
    if db_msg.person:
        person_name = db_msg.person.name
    elif db_msg.group:
        person_name = db_msg.group.name

    # Gather history if note exists (Matching main.py logic)
    history_text = "No prior history available."
    if db_msg.note and db_msg.person:
        prev_notes = (
            db.query(models.Note)
            .filter(
                models.Note.person_id == db_msg.person_id,
                models.Note.id != db_msg.note_id,
                models.Note.cleaned_text != None,
            )
            .order_by(models.Note.date.desc())
            .limit(2)
            .all()
        )
        if prev_notes:
            history_text = "\n".join([f"- {n.date}: {n.title}" for n in prev_notes])

    current_draft = db_msg.draft_text or ""

    # Gather Framework Context
    framework_context = resolve_framework_items(
        db,
        persona_id=db_msg.persona_id,
        person_id=db_msg.person_id,
        group_id=db_msg.group_id,
        aspects=["Tone", "Phrasing", "Formatting", "Principles", "Communication"],
    )

    # Use workflow-like templating if starting fresh, otherwise raw iterate
    if (
        feedback == "Draft a professional follow-up based on the available context."
        and not current_draft
    ):
        prompt = llm.templates.professional_draft(
            person_name=person_name,
            summary=(
                db_msg.note.cleaned_text if db_msg.note else "Professional outreach"
            ),
            history=history_text,
            framework_context=framework_context,
        )
    else:
        # Surgical refinement
        prompt = llm.templates.iterate_professional_draft(
            current_draft=current_draft,
            feedback=feedback,
            person_name=person_name,
            note_context=note_context,
            history=history_text,
            highlight_text=highlight_text,
            framework_context=framework_context,
        )

    from ..websockets_manager import ws_manager

    await ws_manager.broadcast(
        {
            "event": "llm_start",
            "data": {
                "type": "message_refinement",
                "prompt": f"Refining message for {person_name}",
            },
        }
    )

    try:
        new_draft = await llm.llm_manager.acall(
            prompt=prompt, system=f"Refining professional outreach for {person_name}."
        )
        db_msg.draft_text = new_draft
        db.commit()
        await ws_manager.broadcast(
            {
                "event": "llm_finish",
                "data": {"type": "message_refinement", "result": new_draft},
            }
        )
        return {"draft_text": new_draft}
    except Exception as e:
        print(f"DEBUG: Message iteration failed: {e}")
        await ws_manager.broadcast({"event": "llm_error", "data": str(e)})
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{message_id}")
def delete_message(message_id: int, db: Session = Depends(get_db)):
    db_msg = db.query(models.Message).filter(models.Message.id == message_id).first()
    if not db_msg:
        raise HTTPException(status_code=404, detail="Message not found")

    db.delete(db_msg)
    db.commit()
    return {"status": "success"}
