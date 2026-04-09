from fastapi import FastAPI, WebSocket, Depends, HTTPException, status, File, UploadFile
from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
import uvicorn
import socket
import os
import json

from . import models, schemas, database, llm
from datetime import datetime
import asyncio
import numpy as np
import tempfile

# Ensure database tables exist (simple startup for prototype)
# In production, Alembic handles this.
models.Base.metadata.create_all(bind=database.engine)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Pre-load the 20GB MoE model into VRAM on startup
    print(">>> Pre-loading Gemma 4 26B MoE into VRAM...")
    # Run in thread to not block the event loop
    asyncio.create_task(asyncio.to_thread(llm.llm_manager.load_model))
    yield

app = FastAPI(title="Paraclete Backend", lifespan=lifespan)
manager = None

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except:
                pass

manager = ConnectionManager()

@app.post("/process/ocr")
async def process_ocr(file: UploadFile = File(...)):
    # Write to a temporary file for the vision projector to read
    temp_fd, temp_path = tempfile.mkstemp(suffix=os.path.splitext(file.filename)[1])
    try:
        with os.fdopen(temp_fd, 'wb') as tmp:
            tmp.write(await file.read())
            
        await manager.broadcast({"event": "llm_start", "data": {"type": "ocr", "prompt": "Image Analysis"}})
        
        # Use the specialized OCR workflow
        result = await llm.workflows.run_ocr(temp_path)
        
        await manager.broadcast({"event": "llm_finish", "data": {"type": "ocr", "result": result}})
        return {"text": result}
    finally:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except:
                pass

@app.post("/process/dictate")
async def process_dictate(file: UploadFile = File(...)):
    await manager.broadcast({"event": "llm_start", "data": {"type": "dictation", "prompt": "Cleaning Audio Capture"}})
    
    result = await llm.workflows.run_dictation(file.filename)
    
    await manager.broadcast({"event": "llm_finish", "data": {"type": "dictation", "result": result}})
    return {"text": result}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.get("/llm/status")
async def get_llm_status():
    return {
        "is_ready": llm.llm_manager.is_loaded(),
        "model_path": llm.llm_manager.model_path or "default (Gemma-4-MoE)"
    }

# --- Health & Base ---
@app.get("/")

async def root():
    return {"message": "Paraclete API is running"}

@app.get("/health")
async def health():
    return {"status": "ok"}

# --- Person CRUD ---
@app.post("/persons/", response_model=schemas.Person)
def create_person(person: schemas.PersonCreate, db: Session = Depends(get_db)):
    db_person = models.Person(name=person.name, contact_method=person.contact_method)
    db.add(db_person)
    db.commit()
    db.refresh(db_person)
    return db_person

@app.get("/persons/", response_model=List[schemas.Person])
def read_persons(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(models.Person).offset(skip).limit(limit).all()

@app.get("/persons/{person_id}", response_model=schemas.Person)
def read_person(person_id: int, db: Session = Depends(get_db)):
    db_person = db.query(models.Person).filter(models.Person.id == person_id).first()
    if db_person is None:
        raise HTTPException(status_code=404, detail="Person not found")
    return db_person

@app.patch("/persons/{person_id}", response_model=schemas.Person)
def update_person(person_id: int, person_update: schemas.PersonUpdate, db: Session = Depends(get_db)):
    db_person = db.query(models.Person).filter(models.Person.id == person_id).first()
    if db_person is None:
        raise HTTPException(status_code=404, detail="Person not found")
    
    update_data = person_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_person, key, value)
    
    db.commit()
    db.refresh(db_person)
    return db_person

@app.delete("/persons/{person_id}")
def delete_person(person_id: int, db: Session = Depends(get_db)):
    db_person = db.query(models.Person).filter(models.Person.id == person_id).first()
    if db_person is None:
        raise HTTPException(status_code=404, detail="Person not found")
    db.delete(db_person)
    db.commit()
    return {"status": "success"}

# --- Group CRUD ---
@app.post("/groups/", response_model=schemas.Group)
def create_group(group: schemas.GroupCreate, db: Session = Depends(get_db)):
    db_group = models.Group(name=group.name, description=group.description)
    db.add(db_group)
    db.commit()
    db.refresh(db_group)
    return db_group

@app.get("/groups/", response_model=List[schemas.Group])
def read_groups(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(models.Group).offset(skip).limit(limit).all()

@app.get("/groups/{group_id}", response_model=schemas.Group)
def read_group(group_id: int, db: Session = Depends(get_db)):
    db_group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if db_group is None:
        raise HTTPException(status_code=404, detail="Group not found")
    return db_group

@app.patch("/groups/{group_id}", response_model=schemas.Group)
def update_group(group_id: int, group_update: schemas.GroupUpdate, db: Session = Depends(get_db)):
    db_group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if db_group is None:
        raise HTTPException(status_code=404, detail="Group not found")
    
    update_data = group_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_group, key, value)
    
    db.commit()
    db.refresh(db_group)
    return db_group

@app.delete("/groups/{group_id}")
def delete_group(group_id: int, db: Session = Depends(get_db)):
    db_group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if db_group is None:
        raise HTTPException(status_code=404, detail="Group not found")
    db.delete(db_group)
    db.commit()
    return {"status": "success"}

@app.post("/groups/{group_id}/members/{person_id}")
def add_group_member(group_id: int, person_id: int, db: Session = Depends(get_db)):
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    person = db.query(models.Person).filter(models.Person.id == person_id).first()
    if not group or not person:
        raise HTTPException(status_code=404, detail="Group or Person not found")
    if person not in group.members:
        group.members.append(person)
        db.commit()
    return {"status": "success"}

@app.delete("/groups/{group_id}/members/{person_id}")
def remove_group_member(group_id: int, person_id: int, db: Session = Depends(get_db)):
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    person = db.query(models.Person).filter(models.Person.id == person_id).first()
    if not group or not person:
        raise HTTPException(status_code=404, detail="Group or Person not found")
    if person in group.members:
        group.members.remove(person)
        db.commit()
    return {"status": "success"}

# --- Transient Analysis (Review then Save) ---
from pydantic import BaseModel

class AnalysisRequest(BaseModel):
    raw_text: str
    person_id: int | None = None
    group_id: int | None = None


class SessionBriefRequest(BaseModel):
    person_id: int | None = None
    group_id: int | None = None

@app.post("/analysis/session-brief")
async def get_session_brief(req: SessionBriefRequest, db: Session = Depends(get_db)):
    person_name = "General"
    history_text = "No previous history."

    if req.person_id:
        person = db.query(models.Person).filter(models.Person.id == req.person_id).first()
        if person:
            person_name = person.name
            notes = db.query(models.Note).filter(models.Note.person_id == req.person_id).order_by(models.Note.date.desc()).limit(5).all()
            if notes:
                history_text = "\n".join([f"- {n.date}: {n.cleaned_text[:300]}..." for n in notes if n.cleaned_text])
    elif req.group_id:
        group = db.query(models.Group).filter(models.Group.id == req.group_id).first()
        if group:
            person_name = f"Group: {group.name}"
            notes = db.query(models.Note).filter(models.Note.group_id == req.group_id).order_by(models.Note.date.desc()).limit(5).all()
            if notes:
                history_text = "\n".join([f"- {n.date}: {n.cleaned_text[:300]}..." for n in notes if n.cleaned_text])

    try:
        brief = await llm.workflows.run_session_brief(person_name, history_text)
        return {"result": brief}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/analysis/process")
async def transient_process(req: AnalysisRequest, db: Session = Depends(get_db)):
    # Gather context
    person_name = "General"
    person_tags = "None"
    history_text = "No previous history."
    references_text = "None"

    if req.person_id:
        person = db.query(models.Person).filter(models.Person.id == req.person_id).first()
        if person:
            person_name = person.name
            person_tags = ", ".join([f"{t.key}: {t.value}" for t in person.tags])
            
            # History
            notes = db.query(models.Note).filter(models.Note.person_id == req.person_id).order_by(models.Note.date.desc()).limit(5).all()
            if notes:
                history_text = "\n".join([f"- {n.date}: {n.cleaned_text[:200]}..." for n in notes if n.cleaned_text])
            
            # Person References
            if person.references:
                refs = [f"- {r.title}: {r.body[:200]}..." for r in person.references]
                references_text = "\n".join(refs)

    # Taxonomy context
    existing_tags = db.query(models.Tag).all()
    tag_taxonomy = ", ".join([f"{t.key}: {t.value}" for t in existing_tags]) if existing_tags else "None"

    context = {
        "person_name": person_name,
        "person_tags": person_tags,
        "references": references_text,
        "previous_notes": history_text,
        "existing_tags": tag_taxonomy
    }

    try:
        cleaned_text = await llm.workflows.run_note_cleanse(req.raw_text, context)
        return {"result": cleaned_text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/analysis/extract")
async def transient_extract(req: AnalysisRequest, db: Session = Depends(get_db)):
    grammar = r'''
    root   ::= object
    object ::= "{" space ( pair ( "," space pair )* )? "}"
    pair   ::= string ":" space value
    string ::= "\"" ( [^"] | "\\" ["\\/bfnrt] | "\\u" [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F] )* "\""
    value  ::= string | number | object | array | "true" | "false" | "null"
    array  ::= "[" space ( value ( "," space value )* )? "]"
    number ::= "-"? ([0-9]+ | [0-9]+ "." [0-9]+)
    space  ::= [ \t\n\r]*
    '''
    
    existing_tags = db.query(models.Tag).all()
    tag_context = ", ".join([f"{t.key}: {t.value}" for t in existing_tags]) if existing_tags else "No tags."
    
    current_date = datetime.now()
    date_context = f"CURRENT DATE: {current_date.strftime('%Y-%m-%d')} (Year: {current_date.year})"

    try:
        data = await llm.workflows.run_entity_extraction(
            text=f"EXISTING TAGS: {tag_context}\n\nRAW SESSION NOTE: {req.raw_text}", 
            context=date_context,
            grammar=grammar
        )
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Note CRUD ---
@app.post("/notes/", response_model=schemas.Note)
def create_note(note: schemas.NoteCreate, db: Session = Depends(get_db)):
    db_note = models.Note(**note.model_dump())
    db.add(db_note)
    db.commit()
    db.refresh(db_note)
    return db_note

@app.get("/notes/", response_model=List[schemas.Note])
def read_notes(search: str = None, skip: int = 0, limit: int = 20, db: Session = Depends(get_db)):
    query = db.query(models.Note)
    if search:
        query = query.filter(
            (models.Note.title.ilike(f"%{search}%")) | 
            (models.Note.raw_capture.ilike(f"%{search}%")) | 
            (models.Note.cleaned_text.ilike(f"%{search}%"))
        )
    return query.order_by(models.Note.date.desc(), models.Note.created_at.desc()).offset(skip).limit(limit).all()

@app.get("/notes/by-date/{date_str}", response_model=List[schemas.Note])
def read_notes_by_date(date_str: str, db: Session = Depends(get_db)):
    return db.query(models.Note).filter(models.Note.date == date_str).order_by(models.Note.created_at.desc()).all()

@app.get("/notes/{note_id}", response_model=schemas.Note)
def read_note(note_id: int, db: Session = Depends(get_db)):
    db_note = db.query(models.Note).filter(models.Note.id == note_id).first()
    if db_note is None:
        raise HTTPException(status_code=404, detail="Note not found")
    return db_note

@app.post("/notes/{note_id}/references/{reference_id}")
def link_note_reference(note_id: int, reference_id: int, db: Session = Depends(get_db)):
    note = db.query(models.Note).filter(models.Note.id == note_id).first()
    ref = db.query(models.Reference).filter(models.Reference.id == reference_id).first()
    if not note or not ref:
        raise HTTPException(status_code=404, detail="Note or Reference not found")
    if ref not in note.references:
        note.references.append(ref)
        db.commit()
    return {"status": "success"}

@app.patch("/notes/{note_id}", response_model=schemas.Note)
def update_note(note_id: int, note_update: schemas.NoteUpdate, db: Session = Depends(get_db)):
    db_note = db.query(models.Note).filter(models.Note.id == note_id).first()
    if db_note is None:
        raise HTTPException(status_code=404, detail="Note not found")
    
    update_data = note_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_note, key, value)
    
    db.commit()
    db.refresh(db_note)
    return db_note

@app.post("/notes/{note_id}/process", response_model=schemas.Note)
async def process_note(note_id: int, db: Session = Depends(get_db)):
    db_note = db.query(models.Note).filter(models.Note.id == note_id).first()
    if not db_note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    # 1. Gathering Context
    person_name = "Unknown"
    person_tags = "None"
    references_text = "None"
    history_text = "None"
    
    if db_note.person:
        person = db_note.person
        person_name = person.name
        person_tags = ", ".join([f"{t.key}: {t.value}" if t.key else t.value for t in person.tags])
        
        # References
        if person.references:
            refs = []
            for r in person.references:
                refs.append(f"- {r.title} ({r.type}): {r.body[:200]}...")
            references_text = "\n".join(refs)
            
        # History (Previous 3 notes)
        prev_notes = db.query(models.Note).filter(
            models.Note.person_id == person.id,
            models.Note.id != note_id,
            models.Note.cleaned_text != None
        ).order_by(models.Note.date.desc()).limit(3).all()
        
        if prev_notes:
            hist = []
            for pn in prev_notes:
                summary = pn.cleaned_text[:300].replace('\n', ' ')
                hist.append(f"- {pn.date}: {summary}...")
            history_text = "\n".join(hist)

    # 2. Semantic Search for Relevant References (RAG)
    loop = asyncio.get_event_loop()
    relevant_refs = []
    query = db_note.raw_capture[:500] if db_note.raw_capture else db_note.title
    query_embedding_resp = await loop.run_in_executor(None, lambda: llm.llm_manager.embed(query))
    if query_embedding_resp:
        q_vec = np.array(query_embedding_resp["data"][0]["embedding"])
        all_ref_embs = db.query(models.ReferenceEmbedding).all()
        scored_refs = []
        for re in all_ref_embs:
            r_vec = np.array(json.loads(re.vector))
            norm_q = np.linalg.norm(q_vec)
            norm_r = np.linalg.norm(r_vec)
            if norm_q > 0 and norm_r > 0:
                score = np.dot(q_vec, r_vec) / (norm_q * norm_r)
                if score > 0.4:
                    scored_refs.append((score, re.reference))
        
        scored_refs.sort(key=lambda x: x[0], reverse=True)
        for score, ref in scored_refs[:3]:
            ref_str = f"- {ref.title} ({ref.type}): {ref.body[:300]}..."
            # Check if already present from person references
            if references_text == "None" or ref.title not in references_text:
                relevant_refs.append(ref_str)
    
    if relevant_refs:
        if references_text == "None":
            references_text = "\n".join(relevant_refs)
        else:
            references_text += "\n" + "\n".join(relevant_refs)

    # 3. Taxonomy
    existing_tags = db.query(models.Tag).all()
    tag_taxonomy = ", ".join([f"{t.key}: {t.value}" for t in existing_tags]) if existing_tags else "None"

    # 4. Cleaning
    context = {
        "person_name": person_name,
        "person_tags": person_tags,
        "references": references_text,
        "previous_notes": history_text,
        "existing_tags": tag_taxonomy
    }
    
    await manager.broadcast({"event": "llm_start", "data": {"type": "clean_note", "prompt": "Expansion with Context"}})
    
    try:
        cleaned_text = await llm.workflows.run_note_cleanse(db_note.raw_capture, context)
        await manager.broadcast({"event": "llm_finish", "data": {"type": "clean_note", "result": cleaned_text}})
    except Exception as e:
        await manager.broadcast({"event": "llm_error", "data": str(e)})
        raise HTTPException(status_code=500, detail=str(e))

    # Update note with the AI draft, but keep it in CLEAN (Review) stage
    db_note.cleaned_text = cleaned_text
    db_note.stage = "Clean"
    db.commit()
    db.refresh(db_note)
    return db_note

@app.post("/notes/{note_id}/draft-message", response_model=schemas.Message)
async def draft_note_message(note_id: int, db: Session = Depends(get_db)):
    db_note = db.query(models.Note).filter(models.Note.id == note_id).first()
    # Gather history for the message
    prev_notes = db.query(models.Note).filter(
        models.Note.person_id == db_note.person.id,
        models.Note.id != note_id,
        models.Note.cleaned_text != None
    ).order_by(models.Note.date.desc()).limit(2).all()
    
    history_text = "No previous session history available."
    if prev_notes:
        history_text = "\n".join([f"- {n.date}: {n.title}" for n in prev_notes])

    context = {
        "person_name": db_note.person.name,
        "summary": db_note.cleaned_text or db_note.raw_capture,
        "history": history_text
    }
    
    await manager.broadcast({"event": "llm_start", "data": {"type": "draft_message", "prompt": "Drafting Follow-up"}})
    
    try:
        draft_text = await llm.workflows.run_draft_message(context)
        await manager.broadcast({"event": "llm_finish", "data": {"type": "draft_message", "result": draft_text}})
    except Exception as e:
        await manager.broadcast({"event": "llm_error", "data": str(e)})
        raise HTTPException(status_code=500, detail=str(e))
    
    # Create and save message
    db_msg = models.Message(draft_text=draft_text, note_id=note_id)
    db.add(db_msg)
    db.commit()
    db.refresh(db_msg)
    return db_msg

@app.post("/notes/{note_id}/publish", response_model=schemas.Note)
async def publish_note(note_id: int, db: Session = Depends(get_db)):
    db_note = db.query(models.Note).filter(models.Note.id == note_id).first()
    if not db_note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    # 1. Update Stage
    db_note.stage = "Published"
    
    # 2. Generate/Update Embedding based on FINAL text
    loop = asyncio.get_event_loop()
    embed_text = llm.templates.embed_note(
        title=db_note.title, 
        text=db_note.cleaned_text or db_note.raw_capture
    )
    
    embed_response = await loop.run_in_executor(None, lambda: llm.llm_manager.embed(embed_text))
    if embed_response:
        vector = embed_response["data"][0]["embedding"]
        db_emb = db.query(models.NoteEmbedding).filter(models.NoteEmbedding.note_id == note_id).first()
        if not db_emb:
            db_emb = models.NoteEmbedding(note_id=note_id, vector=json.dumps(vector))
            db.add(db_emb)
        else:
            db_emb.vector = json.dumps(vector)
            
    db.commit()
    db.refresh(db_note)
    return db_note

@app.get("/search/semantic")
async def semantic_search(query: str, db: Session = Depends(get_db)):
    loop = asyncio.get_event_loop()
    query_embedding = await loop.run_in_executor(None, lambda: llm.llm_manager.embed(query))
    if not query_embedding:
        raise HTTPException(status_code=500, detail="Could not generate query embedding")
    
    q_vec = np.array(query_embedding["data"][0]["embedding"])
    
    note_embeddings = db.query(models.NoteEmbedding).all()
    results = []
    
    for ne in note_embeddings:
        n_vec = np.array(json.loads(ne.vector))
        # Cosine similarity
        norm_q = np.linalg.norm(q_vec)
        norm_n = np.linalg.norm(n_vec)
        if norm_q > 0 and norm_n > 0:
            score = np.dot(q_vec, n_vec) / (norm_q * norm_n)
            # Higher threshold for better results
            if score > 0.3: 
                note = db.query(models.Note).filter(models.Note.id == ne.note_id).first()
                if note:
                    results.append({
                        "id": note.id,
                        "title": note.title,
                        "score": float(score),
                        "date": str(note.date)
                    })
    
    results.sort(key=lambda x: x["score"], reverse=True)
    return results[:10]

@app.post("/notes/{note_id}/extract")
async def extract_note_entities(note_id: int, db: Session = Depends(get_db)):
    db_note = db.query(models.Note).filter(models.Note.id == note_id).first()
    if not db_note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    # Simple JSON grammar
    grammar = r'''
    root   ::= object
    object ::= "{" space ( pair ( "," space pair )* )? "}"
    pair   ::= string ":" space value
    string ::= "\"" ( [^"] | "\\" ["\\/bfnrt] | "\\u" [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F] )* "\""
    value  ::= string | number | object | array | "true" | "false" | "null"
    array  ::= "[" space ( value ( "," space value )* )? "]"
    number ::= "-"? ([0-9]+ | [0-9]+ "." [0-9]+)
    space  ::= [ \t\n\r]*
    '''
    
    try:
        # Fetch existing tags to help AI reuse them
        existing_tags = db.query(models.Tag).all()
        tag_context = ", ".join([f"{t.key}: {t.value}" for t in existing_tags]) if existing_tags else "No existing tags."
        
        # We can append this context to the note text or handle it in templates
        # For now, let's just use the current workflow but we might need a custom template call
        # Let's update templates.extract_entities to accept existing_tags
        data = await llm.workflows.run_entity_extraction(
            text=f"EXISTING TAGS: {tag_context}\n\nRAW SESSION NOTE: {db_note.raw_capture}", 
            grammar=grammar
        )
        await manager.broadcast({
            "event": "llm_finish",
            "data": {
                "type": "extract_entities",
                "result": data
            }
        })
        return data
    except Exception as e:
        await manager.broadcast({"event": "llm_error", "data": f"Workflow Error: {e}"})
        raise HTTPException(status_code=500, detail=f"Failed to extract entities: {e}")

@app.delete("/notes/{note_id}")
def delete_note(note_id: int, db: Session = Depends(get_db)):
    db_note = db.query(models.Note).filter(models.Note.id == note_id).first()
    if db_note is None:
        raise HTTPException(status_code=404, detail="Note not found")
    db.delete(db_note)
    db.commit()
    return {"status": "success"}

# --- Reference CRUD ---
@app.post("/references/", response_model=schemas.Reference)
async def create_reference(reference: schemas.ReferenceCreate, db: Session = Depends(get_db)):
    db_ref = models.Reference(**reference.model_dump())
    db.add(db_ref)
    db.commit()
    db.refresh(db_ref)
    
    # Generate embedding
    loop = asyncio.get_event_loop()
    embed_text = f"{db_ref.title} {db_ref.body}"
    embed_response = await loop.run_in_executor(None, lambda: llm.llm_manager.embed(embed_text))
    if embed_response:
        vector = embed_response["data"][0]["embedding"]
        db_emb = models.ReferenceEmbedding(reference_id=db_ref.id, vector=json.dumps(vector))
        db.add(db_emb)
        db.commit()
        
    return db_ref

@app.get("/references/", response_model=List[schemas.Reference])
def read_references(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(models.Reference).offset(skip).limit(limit).all()

# --- Action CRUD ---
@app.post("/actions/", response_model=schemas.Action)
def create_action(action: schemas.ActionCreate, db: Session = Depends(get_db)):
    db_action = models.Action(**action.model_dump())
    db.add(db_action)
    db.commit()
    db.refresh(db_action)
    return db_action

@app.patch("/actions/{action_id}", response_model=schemas.Action)
def update_action(action_id: int, resolved: bool, db: Session = Depends(get_db)):
    db_action = db.query(models.Action).filter(models.Action.id == action_id).first()
    if not db_action:
        raise HTTPException(status_code=404, detail="Action not found")
    db_action.resolved = resolved
    db.commit()
    db.refresh(db_action)
    return db_action

# --- Message CRUD ---
@app.post("/messages/", response_model=schemas.Message)
def create_message(message: schemas.MessageCreate, db: Session = Depends(get_db)):
    db_msg = models.Message(**message.model_dump())
    db.add(db_msg)
    db.commit()
    db.refresh(db_msg)
    return db_msg

@app.post("/messages/{message_id}/send", response_model=schemas.Message)
def send_message(message_id: int, db: Session = Depends(get_db)):
    db_msg = db.query(models.Message).filter(models.Message.id == message_id).first()
    if not db_msg:
        raise HTTPException(status_code=404, detail="Message not found")
    db_msg.sent_at = datetime.utcnow()
    db.commit()
    db.refresh(db_msg)
    return db_msg

# --- Managed Tags ---
@app.post("/tags/", response_model=schemas.Tag)
def create_tag(tag: schemas.TagCreate, db: Session = Depends(get_db)):
    existing = db.query(models.Tag).filter(models.Tag.value == tag.value).first()
    if existing:
        return existing
    db_tag = models.Tag(key=tag.key, value=tag.value)
    db.add(db_tag)
    db.commit()
    db.refresh(db_tag)
    return db_tag

@app.get("/tags/", response_model=List[schemas.Tag])
def read_tags(db: Session = Depends(get_db)):
    return db.query(models.Tag).all()

@app.delete("/tags/{tag_id}")
def delete_tag(tag_id: int, db: Session = Depends(get_db)):
    db_tag = db.query(models.Tag).filter(models.Tag.id == tag_id).first()
    if not db_tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    db.delete(db_tag)
    db.commit()
    return {"status": "success"}

@app.post("/tags/link")
def link_tag(link: schemas.TagLink, db: Session = Depends(get_db)):
    tag = db.query(models.Tag).filter(models.Tag.id == link.tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    
    if link.entity_type == "person":
        obj = db.query(models.Person).filter(models.Person.id == link.entity_id).first()
    elif link.entity_type == "group":
        obj = db.query(models.Group).filter(models.Group.id == link.entity_id).first()
    elif link.entity_type == "note":
        obj = db.query(models.Note).filter(models.Note.id == link.entity_id).first()
    elif link.entity_type == "reference":
        obj = db.query(models.Reference).filter(models.Reference.id == link.entity_id).first()
    else:
        raise HTTPException(status_code=400, detail="Invalid entity type")
    
    if not obj:
        raise HTTPException(status_code=404, detail="Entity not found")
    
    if tag not in obj.tags:
        obj.tags.append(tag)
        db.commit()
    return {"status": "success"}

# --- Atomic Export/Import (Phase 2 Step 4.2) ---
@app.get("/export/", response_model=schemas.FullExport)
def export_data(db: Session = Depends(get_db)):
    return {
        "persons": db.query(models.Person).all(),
        "groups": db.query(models.Group).all(),
        "tags": db.query(models.Tag).all(),
        "notes": db.query(models.Note).all(),
        "references": db.query(models.Reference).all(),
        "actions": db.query(models.Action).all(),
        "messages": db.query(models.Message).all()
    }

@app.post("/import/")
def import_data(data: schemas.FullExport, db: Session = Depends(get_db)):
    # This acts as a single atomic SQL transaction
    try:
        # Clear all existing data
        db.query(models.Message).delete()
        db.query(models.Action).delete()
        db.query(models.Note).delete()
        db.query(models.Reference).delete()
        db.query(models.Person).delete()
        db.query(models.Group).delete()
        db.query(models.Tag).delete()
        db.flush()
        
        # 1. Reload Tags
        tag_map = {}
        for t in data.tags:
            db_tag = models.Tag(**t.model_dump())
            db.add(db_tag)
            tag_map[t.id] = db_tag
        db.flush()
        
        # 2. Reload Persons & Groups
        person_map = {}
        for p in data.persons:
            # RELATIONSHIP FIX: Exclude tags and groups lists which are dicts
            db_person = models.Person(**p.model_dump(exclude={"tags", "groups"}))
            for t in p.tags:
                if t.id in tag_map:
                    db_person.tags.append(tag_map[t.id])
            db.add(db_person)
            person_map[p.id] = db_person
            
        group_map = {}
        for g in data.groups:
            # RELATIONSHIP FIX: Exclude tags and members lists
            db_group = models.Group(**g.model_dump(exclude={"tags", "members"}))
            for t in g.tags:
                if t.id in tag_map:
                    db_group.tags.append(tag_map[t.id])
            db.add(db_group)
            group_map[g.id] = db_group
        db.flush()
        
        # 3. Reload Notes
        note_map = {}
        for n in data.notes:
            # RELATIONSHIP FIX: Exclude all nested relationship objects
            dump = n.model_dump(exclude={"tags", "actions", "messages", "person", "group"})
            db_note = models.Note(**dump)
            for t in n.tags:
                if t.id in tag_map:
                    db_note.tags.append(tag_map[t.id])
            for a in n.actions:
                db_note.actions.append(models.Action(**a.model_dump(exclude={"id"})))
            for m in n.messages:
                db_note.messages.append(models.Message(**m.model_dump(exclude={"id"})))
            db.add(db_note)
            note_map[n.id] = db_note
        db.flush()
        
        # 4. Reload References
        for r in data.references:
            # RELATIONSHIP FIX: Exclude nested tags and other backrefs
            db_ref = models.Reference(**r.model_dump(exclude={"tags", "linked_notes", "persons"}))
            for t in r.tags:
                if t.id in tag_map:
                    db_ref.tags.append(tag_map[t.id])
            db.add(db_ref)
        
        db.commit()
        return {"status": "success", "message": "Atomic import completed with relationship reconstruction"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Import failed: {str(e)}")

# --- Dashboard Endpoints (Phase 4) ---
@app.get("/dashboard/stats", response_model=schemas.DashboardStats)
def get_dashboard_stats(db: Session = Depends(get_db)):
    return {
        "person_count": db.query(models.Person).count(),
        "note_count": db.query(models.Note).count(),
        "group_count": db.query(models.Group).count(),
        "reference_count": db.query(models.Reference).count()
    }

@app.get("/dashboard/calendar", response_model=List[schemas.CalendarDay])
def get_calendar_data(db: Session = Depends(get_db)):
    results = db.query(
        models.Note.date, 
        func.count(models.Note.id).label('count')
    ).group_by(models.Note.date).all()
    
    return [{"date": r.date, "count": r.count} for r in results]

@app.get("/dashboard/recent-notes", response_model=List[schemas.Note])
def get_recent_notes(limit: int = 5, db: Session = Depends(get_db)):
    return db.query(models.Note).order_by(models.Note.created_at.desc()).limit(limit).all()

@app.get("/dashboard/trends", response_model=List[schemas.TrendPoint])
def get_trends(db: Session = Depends(get_db)):
    # 1. Find the tag key with the lowest cardinality (smallest number of unique values)
    tag_counts = db.query(
        models.Tag.key, 
        func.count(models.Tag.id).label('val_count')
    ).filter(models.Tag.key != None).group_by(models.Tag.key).all()
    
    selected_key = None
    if tag_counts:
        # Sort by val_count ascending
        tag_counts.sort(key=lambda x: x.val_count)
        selected_key = tag_counts[0].key

    # 2. Get all notes to process trends
    notes = db.query(models.Note).all()
    
    # Organize by Month-Year (YYYY-MM)
    month_data = {}
    
    for note in notes:
        # Create a key like "2025-10"
        m_key = note.date.strftime('%Y-%m')
        
        if m_key not in month_data:
            month_data[m_key] = {"count": 0, "stacks": {}}
        
        month_data[m_key]["count"] += 1
        
        # Determine stack value for the selected key
        stack_val = "None"
        if selected_key:
            # Check note tags first
            note_tag = next((t.value for t in note.tags if t.key == selected_key), None)
            if note_tag:
                stack_val = note_tag
            elif note.person:
                # Check person tags
                person_tag = next((t.value for t in note.person.tags if t.key == selected_key), None)
                if person_tag:
                    stack_val = person_tag
        
        month_data[m_key]["stacks"][stack_val] = month_data[m_key]["stacks"].get(stack_val, 0) + 1

    # Format result
    # Sort keys (YYYY-MM) chronologically
    sorted_keys = sorted(month_data.keys())
    
    result = []
    for k in sorted_keys:
        # Convert "2025-10" to "Oct 2025"
        dt = datetime.strptime(k, '%Y-%m')
        label = dt.strftime('%b %Y')
        
        stacks = [
            {"name": name, "count": count} 
            for name, count in month_data[k]["stacks"].items()
        ]
        result.append({
            "label": label,
            "count": month_data[k]["count"],
            "stacks": stacks
        })
            
    return result

@app.get("/dashboard/reference-usage", response_model=List[schemas.ReferenceUsage])
def get_reference_usage(db: Session = Depends(get_db)):
    refs = db.query(models.Reference).all()
    usage = []
    for r in refs:
        count = len(r.linked_notes) + len(r.persons)
        usage.append({
            "id": r.id,
            "title": r.title,
            "usage_count": count
        })
    usage.sort(key=lambda x: x["usage_count"], reverse=True)
    return usage[:10]

# --- WebSocket Support ---
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # Echo for testing
            await websocket.send_json({"event": "echo", "data": data})
    except Exception:
        manager.disconnect(websocket) 

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

if __name__ == "__main__":
    ip = get_local_ip()
    expose = os.getenv("PARACLETE_EXPOSE", "0") == "1"
    host = "0.0.0.0" if expose else "127.0.0.1"
    print(f"Starting Paraclete Backend on {host}:8000 (Local IP: {ip})")
    uvicorn.run(app, host=host, port=8000)
