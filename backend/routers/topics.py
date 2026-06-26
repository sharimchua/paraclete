from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import func
from typing import List, Optional
from datetime import datetime

from ..database import get_db
from .. import models, schemas
from ..llm import workflows

router = APIRouter(prefix="/topics", tags=["topics"])

def enrich_topic(t, db: Session):
    nc = len(t.notes)
    mc = len(t.messages)
    rc = len(t.reflections)

    last_active = t.updated_at
    if t.notes and max(n.created_at for n in t.notes) > last_active:
        last_active = max(n.created_at for n in t.notes)
    if t.messages and max(m.created_at for m in t.messages) > last_active:
        last_active = max(m.created_at for m in t.messages)
    if t.reflections and max(r.created_at for r in t.reflections) > last_active:
        last_active = max(r.created_at for r in t.reflections)

    t_dict = {
        "id": t.id,
        "title": t.title,
        "summary": t.summary,
        "state": t.state,
        "person_id": t.person_id,
        "group_id": t.group_id,
        "origin": t.origin,
        "opened_at": t.opened_at,
        "closed_at": t.closed_at,
        "closure_note": t.closure_note,
        "created_at": t.created_at,
        "updated_at": t.updated_at,
        "note_count": nc,
        "message_count": mc,
        "reflection_count": rc,
        "last_active_date": last_active
    }
    return schemas.Topic(**t_dict)

@router.post("/", response_model=schemas.Topic)
def create_topic(topic: schemas.TopicCreate, db: Session = Depends(get_db)):
    topic_data = topic.model_dump()
    if topic_data.get('state') == models.TopicState.active:
        topic_data['opened_at'] = datetime.utcnow()
    elif topic_data.get('state') == models.TopicState.closed:
        topic_data['closed_at'] = datetime.utcnow()

    db_topic = models.Topic(**topic_data)

    if topic.source_note_id:
        note = db.query(models.Note).filter(models.Note.id == topic.source_note_id).first()
        if note: db_topic.notes.append(note)
    if topic.source_message_id:
        msg = db.query(models.Message).filter(models.Message.id == topic.source_message_id).first()
        if msg: db_topic.messages.append(msg)
    if topic.source_reflection_id:
        ref = db.query(models.Reflection).filter(models.Reflection.id == topic.source_reflection_id).first()
        if ref: db_topic.reflections.append(ref)

    db.add(db_topic)
    db.commit()
    db.refresh(db_topic)
    return enrich_topic(db_topic, db)

@router.get("/", response_model=List[schemas.Topic])
def get_topics(person_id: Optional[int] = None, group_id: Optional[int] = None, state: Optional[str] = None, skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    # ⚡ Bolt: Prevent N+1 queries during enrich_topic serialization by eager-loading collections
    query = db.query(models.Topic).options(
        selectinload(models.Topic.notes),
        selectinload(models.Topic.messages),
        selectinload(models.Topic.reflections)
    )
    if person_id:
        query = query.filter(models.Topic.person_id == person_id)
    if group_id:
        query = query.filter(models.Topic.group_id == group_id)
    if state:
        query = query.filter(models.Topic.state == state)

    topics = query.order_by(models.Topic.updated_at.desc()).offset(skip).limit(limit).all()
    return [enrich_topic(t, db) for t in topics]

@router.patch("/{topic_id}", response_model=schemas.Topic)
def update_topic(topic_id: int, topic: schemas.TopicUpdate, db: Session = Depends(get_db)):
    db_topic = db.query(models.Topic).filter(models.Topic.id == topic_id).first()
    if not db_topic:
        raise HTTPException(status_code=404, detail="Topic not found")

    update_data = topic.model_dump(exclude_unset=True)

    if 'state' in update_data and update_data['state'] != db_topic.state:
        if update_data['state'] == models.TopicState.active and db_topic.state == models.TopicState.future:
            db_topic.opened_at = datetime.utcnow()
        elif update_data['state'] == models.TopicState.closed:
            db_topic.closed_at = datetime.utcnow()

    for key, value in update_data.items():
        setattr(db_topic, key, value)

    db.commit()
    db.refresh(db_topic)
    return enrich_topic(db_topic, db)

@router.delete("/{topic_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_topic(topic_id: int, db: Session = Depends(get_db)):
    db_topic = db.query(models.Topic).filter(models.Topic.id == topic_id).first()
    if not db_topic:
        raise HTTPException(status_code=404, detail="Topic not found")
    db.delete(db_topic)
    db.commit()
    return None

async def summarize_topic_background(topic_id: int):
    from ..database import SessionLocal
    db = SessionLocal()
    try:
        topic = db.query(models.Topic).filter(models.Topic.id == topic_id).first()
        if not topic: return

        text_parts = []
        for n in topic.notes:
            if n.cleaned_text: text_parts.append(f"Note: {n.cleaned_text}")
        for m in topic.messages:
            if m.sent_text: text_parts.append(f"Message: {m.sent_text}")
            elif m.draft_text: text_parts.append(f"Message Draft: {m.draft_text}")
        for r in topic.reflections:
            text_parts.append(f"Reflection: {r.content}")

        if not text_parts: return

        full_text = "\n\n".join(text_parts)
        summary = await workflows.run_topic_summary(topic.title, full_text)

        if summary and not summary.startswith("Error"):
            topic.summary = summary
            db.commit()
    except Exception as e:
        print(f"Failed to summarize topic {topic_id}: {e}")
    finally:
        db.close()

@router.post("/{topic_id}/link")
def link_to_topic(topic_id: int, entity_type: str, entity_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    db_topic = db.query(models.Topic).filter(models.Topic.id == topic_id).first()
    if not db_topic:
        raise HTTPException(status_code=404, detail="Topic not found")

    if entity_type == 'note':
        item = db.query(models.Note).filter(models.Note.id == entity_id).first()
        if item and item not in db_topic.notes: db_topic.notes.append(item)
    elif entity_type == 'message':
        item = db.query(models.Message).filter(models.Message.id == entity_id).first()
        if item and item not in db_topic.messages: db_topic.messages.append(item)
    elif entity_type == 'reflection':
        item = db.query(models.Reflection).filter(models.Reflection.id == entity_id).first()
        if item and item not in db_topic.reflections: db_topic.reflections.append(item)
    else:
        raise HTTPException(status_code=400, detail="Invalid entity type")

    db.commit()

    background_tasks.add_task(summarize_topic_background, topic_id)

    return {"status": "linked"}


class TopicSuggestionRequest(schemas.BaseModel):
    entity_type: str
    entity_id: int

@router.post("/suggest")
async def suggest_topic(req: TopicSuggestionRequest, db: Session = Depends(get_db)):
    text = ""
    person_id = None
    group_id = None

    if req.entity_type == "note":
        item = db.query(models.Note).filter(models.Note.id == req.entity_id).first()
        if not item: raise HTTPException(status_code=404, detail="Note not found")
        text = item.cleaned_text or item.raw_capture or ""
        person_id = item.person_id
        group_id = item.group_id
        if item.topics: return {"suggested_topic_id": None}
    elif req.entity_type == "message":
        item = db.query(models.Message).filter(models.Message.id == req.entity_id).first()
        if not item: raise HTTPException(status_code=404, detail="Message not found")
        text = item.sent_text or item.draft_text or ""
        person_id = item.person_id
        group_id = item.group_id
        if item.topics: return {"suggested_topic_id": None}
    elif req.entity_type == "reflection":
        item = db.query(models.Reflection).filter(models.Reflection.id == req.entity_id).first()
        if not item: raise HTTPException(status_code=404, detail="Reflection not found")
        text = item.content or ""
        person_id = item.person_id
        group_id = item.group_id
        if item.topics: return {"suggested_topic_id": None}
    else:
        raise HTTPException(status_code=400, detail="Invalid entity type")

    if not text.strip():
        return {"suggested_topic_id": None}

    query = db.query(models.Topic).filter(models.Topic.state != models.TopicState.closed)
    if person_id:
        query = query.filter(models.Topic.person_id == person_id)
    elif group_id:
        query = query.filter(models.Topic.group_id == group_id)
    else:
        return {"suggested_topic_id": None}

    active_topics = query.all()
    if not active_topics:
        return {"suggested_topic_id": None}

    topics_str = "\n".join([f"ID {t.id}: {t.title} - {t.summary}" for t in active_topics])

    try:
        suggestion = await workflows.run_suggest_topic_link(text[:1000], topics_str)
        return suggestion
    except Exception as e:
        print(f"Failed to run topic suggestion: {e}")
        return {"suggested_topic_id": None}
