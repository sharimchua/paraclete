from fastapi import FastAPI, WebSocket, Depends, HTTPException, status, File, UploadFile
from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import List, Dict, Set
import uvicorn
import socket
import os
import json

from . import models, schemas, database, llm
from .routers import references, framework, messages, admin, paraclete
from datetime import datetime, timedelta
import asyncio
import numpy as np
import tempfile
import uuid
import shutil
from fastapi.staticfiles import StaticFiles

# Ensure database tables exist (simple startup for prototype)
# In production, Alembic handles this.
models.Base.metadata.create_all(bind=database.engine)

from .llm.downloader import model_downloader
import sys

async def load_llm_with_broadcast():
    # Wait a moment to ensure the server is ready to accept socket connections
    await asyncio.sleep(2)
    
    # Fetch settings from DB to initialize LLM Manager
    try:
        db = next(database.get_db())
        settings_rows = db.query(models.Setting).all()
        settings = {s.key: s.value for s in settings_rows}
        llm.llm_manager.update_config(settings)
        db.close()
    except Exception as se:
        print(f"DEBUG: Failed to sync settings on startup: {se}")

    # Check for required models and download if missing
    executable_dir = os.path.dirname(sys.executable)
    models_dir = os.path.join(executable_dir, "models")
    
    required_models = [
        ("gemma-4-moe.gguf", "Analysis Engine"),
        ("gemma-e4b.gguf", "Chat Specialist")
    ]

    async def report_progress(name, progress):
        await ws_manager.broadcast({
            "event": "llm_start", 
            "data": {"type": "download", "prompt": f"Downloading {name}: {progress}%"}
        })

    loop = asyncio.get_event_loop()
    def sync_report(name, progress):
        asyncio.run_coroutine_threadsafe(report_progress(name, progress), loop)

    async def broadcast_llm_status():
        await ws_manager.broadcast({
            "event": "llm_status",
            "data": llm.llm_manager.get_status()
        })

    def sync_status_broadcast():
        asyncio.run_coroutine_threadsafe(broadcast_llm_status(), loop)

    llm.llm_manager.on_status_change = sync_status_broadcast

    for filename, label in required_models:
        path = os.path.join(models_dir, filename)
        if not os.path.exists(path):
            sync_report(label, 0)
            success = await model_downloader.download_if_missing(filename, path, sync_report)
            if not success:
                await ws_manager.broadcast({
                    "event": "llm_error", 
                    "data": f"Failed to download {label}. Please check your connection."
                })

    await ws_manager.broadcast({"event": "llm_start", "data": {"type": "warmup", "prompt": "Warming up Analysis Engine..."}})
    try:
        # Default to analysis model on startup
        await asyncio.to_thread(llm.llm_manager.ensure_model, "analysis")
        await ws_manager.broadcast({"event": "llm_finish", "data": {"type": "warmup", "result": "Analysis Engine Ready"}})
    except Exception as e:
        await ws_manager.broadcast({"event": "llm_error", "data": str(e)})

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Pre-load intelligence on startup
    print(">>> Initializing Paraclete Intelligence...")
    asyncio.create_task(load_llm_with_broadcast())
    yield

app = FastAPI(title="Paraclete Backend", lifespan=lifespan)


# Include Routers with /api prefix
app.include_router(references.router, prefix="/api")
app.include_router(framework.router, prefix="/api")
app.include_router(messages.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(paraclete.router, prefix="/api")
# Also include without prefix for legacy compatibility if needed, 
# but the plan specifies /api for new features.
app.include_router(references.router)
app.include_router(framework.router)
app.include_router(messages.router)
app.include_router(admin.router)
app.include_router(paraclete.router)

from .websockets_manager import ws_manager

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    # Send initial LLM status
    await websocket.send_json({
        "event": "llm_status",
        "data": llm.llm_manager.get_status()
    })
    try:
        while True:
            await websocket.receive_text()
    except:
        ws_manager.disconnect(websocket)

# --- Companion & Upload Infrastructure ---
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)
COMPANION_DIR = os.path.join(UPLOAD_DIR, "companion")
os.makedirs(COMPANION_DIR, exist_ok=True)

COMPANION_SESSIONS = {} # session_id -> list of file paths

def get_local_ip():
    """
    Finds the primary local IP address of the machine.
    Tries multiple methods for robustness across different network configurations.
    """
    # Method 1: Try connecting to an external address (won't actually send data)
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.5)
        # 8.8.8.8 is Google DNS, but we just need any valid public IP
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        if ip and not ip.startswith("127."):
            return ip
    except Exception:
        pass

    # Method 2: Use socket.gethostbyname with hostname
    try:
        hostname = socket.gethostname()
        ip = socket.gethostbyname(hostname)
        if ip and not ip.startswith("127."):
            return ip
    except Exception:
        pass

    # Method 3: Iterate through all network interfaces (more thorough)
    try:
        # This works on many systems including Windows
        interfaces = socket.getaddrinfo(socket.gethostname(), None)
        for interface in interfaces:
            # Check for IPv4 and non-loopback
            ip = interface[4][0]
            if "." in ip and not ip.startswith("127."):
                return ip
    except Exception:
        pass

    return "127.0.0.1"

@app.post("/companion/session")
async def create_companion_session():
    sid = str(uuid.uuid4())
    COMPANION_SESSIONS[sid] = []
    local_ip = get_local_ip()
    # Assuming port 8000 for now, but in Electron it might vary.
    # In a real app we'd pass the actual port.
    return {"session_id": sid, "url": f"http://{local_ip}:8000/static/companion/index.html?sid={sid}"}

@app.post("/companion/{sid}/upload")
async def companion_upload(sid: str, file: UploadFile = File(...)):
    if sid not in COMPANION_SESSIONS:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Save file
    file_id = str(uuid.uuid4())
    ext = os.path.splitext(file.filename)[1] or ".jpg"
    filename = f"{file_id}{ext}"
    filepath = os.path.join(COMPANION_DIR, filename)
    
    with open(filepath, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    COMPANION_SESSIONS[sid].append(filepath)
    
    # Broadcast to desktop
    await ws_manager.broadcast({
        "event": "companion_image",
        "data": {
            "session_id": sid,
            "image_id": file_id,
            "filename": filename,
            "url": f"/static/uploads/companion/{filename}"
        }
    })
    
    return {"status": "success", "image_id": file_id}

@app.get("/companion/session/{sid}/images")
async def get_companion_images(sid: str):
    if sid not in COMPANION_SESSIONS:
        raise HTTPException(status_code=404, detail="Session not found")
    
    images = []
    for path in COMPANION_SESSIONS[sid]:
        filename = os.path.basename(path)
        images.append({
            "filename": filename,
            "url": f"/static/uploads/companion/{filename}"
        })
    return images

@app.post("/process/ocr")
async def process_ocr(files: List[UploadFile] = File(...)):
    temp_paths = []
    try:
        for file in files:
            temp_fd, temp_path = tempfile.mkstemp(suffix=os.path.splitext(file.filename)[1])
            with os.fdopen(temp_fd, 'wb') as tmp:
                tmp.write(await file.read())
            temp_paths.append(temp_path)
            
        await ws_manager.broadcast({"event": "llm_start", "data": {"type": "ocr", "prompt": f"Analysing {len(temp_paths)} image(s)"}})
        
        # Use the specialized OCR workflow with multiple paths
        result = await llm.workflows.run_ocr(temp_paths)
        
        await ws_manager.broadcast({"event": "llm_finish", "data": {"type": "ocr", "result": result}})
        return {"text": result}
    finally:
        for tp in temp_paths:
            if os.path.exists(tp):
                try: os.remove(tp)
                except: pass

@app.post("/process/ocr/companion")
async def process_ocr_companion(sid: str):
    if sid not in COMPANION_SESSIONS or not COMPANION_SESSIONS[sid]:
        raise HTTPException(status_code=404, detail="Session or images not found")
    
    image_paths = COMPANION_SESSIONS[sid]
    
    await ws_manager.broadcast({"event": "llm_start", "data": {"type": "ocr", "prompt": f"Analysing {len(image_paths)} companion image(s)"}})
    
    try:
        # Use the specialized OCR workflow
        result = await llm.workflows.run_ocr(image_paths)
        
        await ws_manager.broadcast({"event": "llm_finish", "data": {"type": "ocr", "result": result}})
        return {"text": result}
    except Exception as e:
        await ws_manager.broadcast({"event": "llm_error", "data": str(e)})
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/process/dictate")
async def process_dictate(file: UploadFile = File(...)):
    await ws_manager.broadcast({"event": "llm_start", "data": {"type": "dictation", "prompt": "Cleaning Audio Capture"}})
    
    result = await llm.workflows.run_dictation(file.filename)
    
    await ws_manager.broadcast({"event": "llm_finish", "data": {"type": "dictation", "result": result}})
    return {"text": result}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Context-Usage"],
)

# Mount static files for companion app and uploads
static_companion_path = os.path.join(os.path.dirname(__file__), "static", "companion")
app.mount("/static/companion", StaticFiles(directory=static_companion_path), name="companion")
app.mount("/static/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

def get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.get("/llm/status")
async def get_llm_status():
    return llm.llm_manager.get_status()

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
    db_person = models.Person(**person.model_dump())
    db.add(db_person)
    db.commit()
    db.refresh(db_person)
    return db_person

@app.get("/persons/", response_model=List[schemas.Person])
def read_persons(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    persons = db.query(models.Person).options(
        joinedload(models.Person.persona).joinedload(models.Persona.framework),
        joinedload(models.Person.groups).joinedload(models.Group.persona).joinedload(models.Persona.framework)
    ).offset(skip).limit(limit).all()
    
    for p in persons:
        if not p.persona:
            # Try inheriting from groups
            for group in p.groups:
                if group.persona:
                    p.inherited_persona = group.persona
                    break
    return persons

@app.get("/persons/{person_id}", response_model=schemas.Person)
def read_person(person_id: int, db: Session = Depends(get_db)):
    db_person = db.query(models.Person).options(
        joinedload(models.Person.persona).joinedload(models.Persona.framework),
        joinedload(models.Person.groups).joinedload(models.Group.persona).joinedload(models.Persona.framework)
    ).filter(models.Person.id == person_id).first()
    
    if db_person is None:
        raise HTTPException(status_code=404, detail="Person not found")
        
    if not db_person.persona:
        for group in db_person.groups:
            if group.persona:
                db_person.inherited_persona = group.persona
                break
                
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
    db_group = models.Group(**group.model_dump())
    db.add(db_group)
    db.commit()
    db.refresh(db_group)
    return db_group

@app.get("/groups/", response_model=List[schemas.Group])
def read_groups(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(models.Group).options(joinedload(models.Group.persona)).offset(skip).limit(limit).all()

@app.get("/groups/{group_id}", response_model=schemas.Group)
def read_group(group_id: int, db: Session = Depends(get_db)):
    db_group = db.query(models.Group).options(
        joinedload(models.Group.persona).joinedload(models.Persona.framework),
        joinedload(models.Group.members).joinedload(models.Person.persona).joinedload(models.Persona.framework),
        joinedload(models.Group.members).joinedload(models.Person.notes),
        joinedload(models.Group.members).joinedload(models.Person.messages)
    ).filter(models.Group.id == group_id).first()
    
    if db_group is None:
        raise HTTPException(status_code=404, detail="Group not found")
    
    # Member Stats
    all_member_note_dates = []
    total_member_messages = 0
    total_member_notes = 0
    
    for m in db_group.members:
        m.note_count = len(m.notes)
        m.message_count = len(m.messages)
        total_member_notes += m.note_count
        total_member_messages += m.message_count
        
        note_dates = [n.date for n in m.notes if n.date]
        if note_dates:
            m.latest_note_date = max(note_dates)
            all_member_note_dates.extend(note_dates)
        else:
            m.latest_note_date = None

    # explicit group activity
    group_notes = db.query(models.Note).filter(models.Note.group_id == group_id).all()
    group_messages = db.query(models.Message).filter(models.Message.group_id == group_id).all()
    
    group_note_dates = [n.date for n in group_notes if n.date]
    
    db_group.aggregated_note_count = len(group_notes) + total_member_notes
    db_group.aggregated_message_count = len(group_messages) + total_member_messages
    
    all_dates = all_member_note_dates + group_note_dates
    if all_dates:
        db_group.earliest_note_date = min(all_dates)
        db_group.latest_note_date = max(all_dates)
    else:
        db_group.earliest_note_date = None
        db_group.latest_note_date = None
        
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
    note_id: int | None = None

class TitleSuggestionRequest(BaseModel):
    text: str

@app.post("/analysis/session-brief")
async def get_session_brief(req: SessionBriefRequest, db: Session = Depends(get_db)):
    # 0. Check if we already have a brief for this note
    if req.note_id:
        db_note = db.query(models.Note).filter(models.Note.id == req.note_id).first()
        if db_note and db_note.session_brief:
            return {"result": db_note.session_brief}

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

    await ws_manager.broadcast({"event": "llm_start", "data": {"type": "session_brief", "prompt": "Synthesizing Session Brief"}})
    try:
        brief = await llm.workflows.run_session_brief(person_name, history_text)
        await ws_manager.broadcast({"event": "llm_finish", "data": {"type": "session_brief", "result": brief}})
        return {"result": brief}
    except Exception as e:
        await ws_manager.broadcast({"event": "llm_error", "data": str(e)})
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/analysis/suggest-title")
async def suggest_note_title(req: TitleSuggestionRequest):
    await ws_manager.broadcast({"event": "llm_start", "data": {"type": "title_suggestion", "prompt": "Generating Title"}})
    try:
        title = await llm.workflows.run_suggest_title(req.text)
        # Cleanup quotes if any
        title = title.strip().strip('"').strip("'")
        await ws_manager.broadcast({"event": "llm_finish", "data": {"type": "title_suggestion", "result": title}})
        return {"result": title}
    except Exception as e:
        await ws_manager.broadcast({"event": "llm_error", "data": str(e)})
        raise HTTPException(status_code=500, detail=str(e))

from .services.framework_resolver import resolve_framework_items

@app.post("/analysis/process")
async def transient_process(req: AnalysisRequest, db: Session = Depends(get_db)):
    # Gather context
    person_id = req.person_id
    group_id = req.group_id
    
    person_name = "General"
    person_tags = "None"
    history_text = "No previous history."
    references_text = "None"

    if person_id:
        person = db.query(models.Person).filter(models.Person.id == person_id).first()
        if person:
            person_name = person.name
            person_tags = ", ".join([f"{t.key}: {t.value}" for t in person.tags])
            
            # History
            notes = db.query(models.Note).filter(models.Note.person_id == person_id).order_by(models.Note.date.desc()).limit(5).all()
            if notes:
                history_text = "\n".join([f"- {n.date}: {n.cleaned_text[:200]}..." for n in notes if n.cleaned_text])
            
            # Person References
            if person.references:
                refs = [f"- {r.title}: {r.body[:200]}..." for r in person.references]
                references_text = "\n".join(refs)
    elif group_id:
        group = db.query(models.Group).filter(models.Group.id == group_id).first()
        if group:
            person_name = f"Group: {group.name}"
            # History for group
            notes = db.query(models.Note).filter(models.Note.group_id == group_id).order_by(models.Note.date.desc()).limit(5).all()
            if notes:
                history_text = "\n".join([f"- {n.date}: {n.cleaned_text[:200]}..." for n in notes if n.cleaned_text])

    # Hierarchy-aware Practise Framework
    framework_context = resolve_framework_items(db, person_id=person_id, group_id=group_id)

    # Taxonomy context
    existing_tags = db.query(models.Tag).all()
    tag_taxonomy = ", ".join([f"{t.key}: {t.value}" for t in existing_tags]) if existing_tags else "None"

    # Practitioner Profile Context
    settings = {s.key: s.value for s in db.query(models.Setting).all()}
    practitioner_name = settings.get("practitioner_name", "the practitioner")
    practitioner_preferred_name = settings.get("practitioner_preferred_name", "the practitioner")
    practitioner_bio = settings.get("practitioner_bio", "")

    context = {
        "person_name": person_name,
        "person_tags": person_tags,
        "references": references_text,
        "previous_notes": history_text,
        "existing_tags": tag_taxonomy,
        "framework_expectations": framework_context,
        "practitioner_name": practitioner_name,
        "practitioner_preferred_name": practitioner_preferred_name,
        "practitioner_bio": practitioner_bio
    }

    await ws_manager.broadcast({"event": "llm_start", "data": {"type": "note_refinement", "prompt": "Refining Session Note"}})
    try:
        cleaned_text = await llm.workflows.run_note_cleanse(req.raw_text, context)
        await ws_manager.broadcast({"event": "llm_finish", "data": {"type": "note_refinement", "result": cleaned_text}})
        return {"result": cleaned_text}
    except Exception as e:
        await ws_manager.broadcast({"event": "llm_error", "data": str(e)})
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
    
    await ws_manager.broadcast({"event": "llm_start", "data": {"type": "extract_entities", "prompt": "Extracting Entities"}})
    try:
        # Fetch existing tags to help AI reuse them
        existing_tags = db.query(models.Tag).all()
        # Group existing tags by key for better context
        grouped_tags = {}
        for t in existing_tags:
            if t.key not in grouped_tags:
                grouped_tags[t.key] = []
            grouped_tags[t.key].append(t.value)
        
        tag_context = "EXISTING TAXONOMY:\n"
        for key, values in grouped_tags.items():
            tag_context += f"- {key}: {', '.join(values)}\n"
        
        entity_name = "General"
        if req.person_id:
            p = db.query(models.Person).filter(models.Person.id == req.person_id).first()
            if p: entity_name = p.name
        elif req.group_id:
            g = db.query(models.Group).filter(models.Group.id == req.group_id).first()
            if g: entity_name = g.name

        context = f"{tag_context}\nSUBJECT: {entity_name}"
        
        data = await llm.workflows.run_entity_extraction(
            text=req.raw_text, 
            context=context,
            grammar=grammar
        )
        await ws_manager.broadcast({"event": "llm_finish", "data": {"type": "extract_entities", "result": data}})
        return data
    except Exception as e:
        await ws_manager.broadcast({"event": "llm_error", "data": str(e)})
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
def read_notes(person_id: int = None, group_id: int = None, search: str = None, skip: int = 0, limit: int = 1000, db: Session = Depends(get_db)):
    query = db.query(models.Note).options(
        joinedload(models.Note.person).joinedload(models.Person.persona).joinedload(models.Persona.framework),
        joinedload(models.Note.person).joinedload(models.Person.groups).joinedload(models.Group.persona).joinedload(models.Persona.framework),
        joinedload(models.Note.group).joinedload(models.Group.persona).joinedload(models.Persona.framework),
        joinedload(models.Note.tags),
        joinedload(models.Note.actions),
        joinedload(models.Note.messages)
    )
    if person_id:
        query = query.filter(models.Note.person_id == person_id)
    if group_id:
        query = query.filter(models.Note.group_id == group_id)
    if search:
        query = query.filter(
            (models.Note.title.ilike(f"%{search}%")) | 
            (models.Note.raw_capture.ilike(f"%{search}%")) | 
            (models.Note.cleaned_text.ilike(f"%{search}%"))
        )
    notes = query.order_by(models.Note.date.desc(), models.Note.created_at.desc()).offset(skip).limit(limit).all()
    
    # Calculate inherited personas for notes
    for n in notes:
        if n.person and not n.person.persona:
            for group in n.person.groups:
                if group.persona:
                    n.person.inherited_persona = group.persona
                    break
    return notes

@app.get("/notes/by-date/{date_str}", response_model=List[schemas.Note])
def read_notes_by_date(date_str: str, db: Session = Depends(get_db)):
    return db.query(models.Note).filter(models.Note.date == date_str).order_by(models.Note.created_at.desc()).all()

@app.get("/notes/{note_id}", response_model=schemas.Note)
def read_note(note_id: int, db: Session = Depends(get_db)):
    db_note = db.query(models.Note).options(
        joinedload(models.Note.person).joinedload(models.Person.persona),
        joinedload(models.Note.person).joinedload(models.Person.groups).joinedload(models.Group.persona),
        joinedload(models.Note.group).joinedload(models.Group.persona),
        joinedload(models.Note.tags),
        joinedload(models.Note.actions),
        joinedload(models.Note.messages)
    ).filter(models.Note.id == note_id).first()
    
    if db_note is None:
        raise HTTPException(status_code=404, detail="Note not found")
        
    # Calculate inherited persona
    if db_note.person and not db_note.person.persona:
        for group in db_note.person.groups:
            if group.persona:
                db_note.person.inherited_persona = group.persona
                break

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
    relevant_refs = []
    query = db_note.raw_capture[:500] if db_note.raw_capture else db_note.title
    query_embedding_resp = await llm.llm_manager.aembed(query)
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

    # Hierarchy-aware Practise Framework
    framework_context = resolve_framework_items(db, person_id=db_note.person_id, group_id=db_note.group_id)

    # Practitioner Profile Context
    settings = {s.key: s.value for s in db.query(models.Setting).all()}
    practitioner_name = settings.get("practitioner_name", "the practitioner")
    practitioner_preferred_name = settings.get("practitioner_preferred_name", "the practitioner")
    practitioner_bio = settings.get("practitioner_bio", "")

    # 4. Cleaning
    context = {
        "person_name": person_name,
        "person_tags": person_tags,
        "references": references_text,
        "previous_notes": history_text,
        "existing_tags": tag_taxonomy,
        "framework_expectations": framework_context,
        "practitioner_name": practitioner_name,
        "practitioner_preferred_name": practitioner_preferred_name,
        "practitioner_bio": practitioner_bio
    }
    
    await ws_manager.broadcast({"event": "llm_start", "data": {"type": "clean_note", "prompt": "Expansion with Context"}})
    
    try:
        cleaned_text = await llm.workflows.run_note_cleanse(db_note.raw_capture, context)
        await ws_manager.broadcast({"event": "llm_finish", "data": {"type": "clean_note", "result": cleaned_text}})
    except Exception as e:
        await ws_manager.broadcast({"event": "llm_error", "data": str(e)})
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

    # Hierarchy-aware Practise Framework
    from .services.framework_resolver import resolve_framework_items
    framework_context = resolve_framework_items(db, person_id=db_note.person_id, group_id=db_note.group_id)

    # Practitioner Profile Context
    settings = {s.key: s.value for s in db.query(models.Setting).all()}
    practitioner_name = settings.get("practitioner_name", "the practitioner")
    practitioner_preferred_name = settings.get("practitioner_preferred_name", "the practitioner")
    practitioner_bio = settings.get("practitioner_bio", "")

    context = {
        "person_name": db_note.person.name if db_note.person else "Unknown",
        "summary": db_note.cleaned_text or db_note.raw_capture,
        "history": history_text,
        "framework_context": framework_context,
        "practitioner_name": practitioner_name,
        "practitioner_preferred_name": practitioner_preferred_name,
        "practitioner_bio": practitioner_bio
    }
    
    await ws_manager.broadcast({"event": "llm_start", "data": {"type": "draft_message", "prompt": "Drafting Follow-up"}})
    
    try:
        draft_text = await llm.workflows.run_draft_message(context)
        await ws_manager.broadcast({"event": "llm_finish", "data": {"type": "draft_message", "result": draft_text}})
    except Exception as e:
        await ws_manager.broadcast({"event": "llm_error", "data": str(e)})
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
    
    await ws_manager.broadcast({"event": "llm_start", "data": {"type": "publish", "prompt": "Updating Search Index"}})
    
    try:
        # 2. Generate/Update Embedding based on FINAL text
        embed_text = llm.templates.embed_note(
            title=db_note.title, 
            text=db_note.cleaned_text or db_note.raw_capture
        )
        
        embed_response = await llm.llm_manager.aembed(embed_text)
        if embed_response:
            vector = embed_response["data"][0]["embedding"]
            db_emb = db.query(models.NoteEmbedding).filter(models.NoteEmbedding.note_id == note_id).first()
            if not db_emb:
                db_emb = models.NoteEmbedding(note_id=note_id, vector=json.dumps(vector))
                db.add(db_emb)
            else:
                db_emb.vector = json.dumps(vector)
        
        await ws_manager.broadcast({"event": "llm_finish", "data": {"type": "publish", "result": "Search Index Updated"}})
    except Exception as e:
        await ws_manager.broadcast({"event": "llm_error", "data": str(e)})
        # We don't necessarily want to fail the whole publish if embedding fails, but let's log it
        print(f"Embedding failed: {e}")
            
    db.commit()
    db.refresh(db_note)
    return db_note

@app.get("/search/semantic")
async def semantic_search(query: str, db: Session = Depends(get_db)):
    await ws_manager.broadcast({"event": "llm_start", "data": {"type": "semantic_search", "prompt": "Searching through knowledge..."}})
    try:
        query_embedding = await llm.llm_manager.aembed(query)
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
                            "note": note,
                            "score": float(score)
                        })
        
        results.sort(key=lambda x: x["score"], reverse=True)
        await ws_manager.broadcast({"event": "llm_finish", "data": {"type": "semantic_search", "count": len(results)}})
        return results[:10]
    except Exception as e:
        await ws_manager.broadcast({"event": "llm_error", "data": str(e)})
        raise HTTPException(status_code=500, detail=str(e))

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
    
    await ws_manager.broadcast({"event": "llm_start", "data": {"type": "extract_entities", "prompt": "Extracting Entities"}})
    try:
        # Fetch existing tags to help AI reuse them
        existing_tags = db.query(models.Tag).all()
        # Group existing tags by key for better context
        grouped_tags = {}
        for t in existing_tags:
            if t.key not in grouped_tags:
                grouped_tags[t.key] = []
            grouped_tags[t.key].append(t.value)
        
        tag_context = "EXISTING TAXONOMY:\n"
        for key, values in grouped_tags.items():
            tag_context += f"- {key}: {', '.join(values)}\n"
        
        entity_name = "General"
        if db_note.person:
            entity_name = db_note.person.name
        elif db_note.group:
            entity_name = db_note.group.name

        context = f"{tag_context}\nSUBJECT: {entity_name}"

        data = await llm.workflows.run_entity_extraction(
            text=db_note.raw_capture, 
            context=context,
            grammar=grammar
        )
        await ws_manager.broadcast({
            "event": "llm_finish",
            "data": {
                "type": "extract_entities",
                "result": data
            }
        })
        return data
    except Exception as e:
        await ws_manager.broadcast({"event": "llm_error", "data": f"Workflow Error: {e}"})
        raise HTTPException(status_code=500, detail=f"Failed to extract entities: {e}")

@app.delete("/notes/{note_id}")
def delete_note(note_id: int, db: Session = Depends(get_db)):
    db_note = db.query(models.Note).filter(models.Note.id == note_id).first()
    if db_note is None:
        raise HTTPException(status_code=404, detail="Note not found")
    db.delete(db_note)
    db.commit()
    return {"status": "success"}

# References moved to routers/references.py

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
        "personas": db.query(models.Persona).all(),
        "practise_frameworks": db.query(models.PractiseFramework).all(),
        "actions": db.query(models.Action).all(),
        "messages": db.query(models.Message).all()
    }

@app.post("/import/")
async def import_data(data: schemas.FullExport, db: Session = Depends(get_db)):
    # This acts as a single atomic SQL transaction
    try:
        # Clear all junction tables first to prevent orphaned associations mapping to new IDs
        db.execute(models.group_members.delete())
        db.execute(models.person_tags.delete())
        db.execute(models.group_tags.delete())
        db.execute(models.note_tags.delete())
        db.execute(models.reference_tags.delete())
        db.execute(models.note_references.delete())
        db.execute(models.person_references.delete())

        # Clear all existing data (including framework entities)
        db.query(models.Message).delete()
        db.query(models.Action).delete()
        db.query(models.Note).delete()
        db.query(models.Reference).delete()
        db.query(models.Person).delete()
        db.query(models.Group).delete()
        db.query(models.Tag).delete()
        db.query(models.Persona).delete()
        db.query(models.PractiseFrameworkItem).delete()
        db.query(models.PractiseFramework).delete()
        db.flush()
        
        # 1. Reload Frameworks
        framework_map = {}
        for pf in data.practise_frameworks:
            # Exclude virtual legacy fields and items list
            dump = pf.model_dump(exclude={"items", "tone_idioms", "formatting_preferences", "common_phrasing", "principles_tenets"})
            db_pf = models.PractiseFramework(**dump)
            for item in pf.items:
                db_pf.items.append(models.PractiseFrameworkItem(**item.model_dump(exclude={"id"})))
            db.add(db_pf)
            db.flush()
            framework_map[pf.id] = db_pf.id

        # 2. Reload Personas
        persona_map = {}
        for persona in data.personas:
            dump = persona.model_dump(exclude={"framework"})
            db_persona = models.Persona(**dump)
            db.add(db_persona)
            db.flush()
            persona_map[persona.id] = db_persona.id

        # 3. Reload Tags
        tag_map = {}
        for t in data.tags:
            db_tag = models.Tag(**t.model_dump())
            db.add(db_tag)
            db.flush()
            tag_map[t.id] = db_tag
        
        # 4. Reload Persons & Groups
        old_person_id_to_new_db_person = {}
        for p in data.persons:
            # RELATIONSHIP & VIRTUAL FIELD FIX
            exclude_fields = {"tags", "groups", "persona", "inherited_persona", "note_count", "message_count", "latest_note_date"}
            dump = p.model_dump(exclude=exclude_fields)
            if p.persona_id and p.persona_id in persona_map:
                dump["persona_id"] = persona_map[p.persona_id]
            
            db_person = models.Person(**dump)
            for t in p.tags:
                if t.id in tag_map:
                    db_person.tags.append(tag_map[t.id])
            db.add(db_person)
            db.flush()
            old_person_id_to_new_db_person[p.id] = db_person
            
        old_group_id_to_new_db_group = {}
        for g in data.groups:
            # RELATIONSHIP & VIRTUAL FIELD FIX
            exclude_fields = {"tags", "members", "persona", "aggregated_note_count", "aggregated_message_count", "earliest_note_date", "latest_note_date"}
            dump = g.model_dump(exclude=exclude_fields)
            if g.persona_id and g.persona_id in persona_map:
                dump["persona_id"] = persona_map[g.persona_id]
                
            db_group = models.Group(**dump)
            for t in g.tags:
                if t.id in tag_map:
                    db_group.tags.append(tag_map[t.id])
            
            # RE-ESTABLISH GROUP MEMBERSHIP
            for m in g.members:
                if m.id in old_person_id_to_new_db_person:
                    db_group.members.append(old_person_id_to_new_db_person[m.id])
                    
            db.add(db_group)
            db.flush()
            old_group_id_to_new_db_group[g.id] = db_group
        
        # 5. Reload Notes
        old_note_id_to_new_db_note = {}
        for n in data.notes:
            dump = n.model_dump(exclude={"tags", "actions", "messages", "person", "group"})
            # Link to new person/group IDs
            if n.person_id and n.person_id in old_person_id_to_new_db_person:
                dump["person_id"] = old_person_id_to_new_db_person[n.person_id].id
            if n.group_id and n.group_id in old_group_id_to_new_db_group:
                dump["group_id"] = old_group_id_to_new_db_group[n.group_id].id
                
            db_note = models.Note(**dump)
            for t in n.tags:
                if t.id in tag_map:
                    db_note.tags.append(tag_map[t.id])
            
            db.add(db_note)
            db.flush()
            old_note_id_to_new_db_note[n.id] = db_note
            
            # Actions (messages handled globally now)
            for a in n.actions:
                db_note.actions.append(models.Action(**a.model_dump(exclude={"id"})))
        
        # 6. Reload Messages (Global list handles both linked and standalone)
        for m in data.messages:
            m_dump = m.model_dump(exclude={"id", "person", "group", "note", "persona"})
            # Re-link entities using maps
            if m.person_id and m.person_id in old_person_id_to_new_db_person:
                m_dump["person_id"] = old_person_id_to_new_db_person[m.person_id].id
            if m.group_id and m.group_id in old_group_id_to_new_db_group:
                m_dump["group_id"] = old_group_id_to_new_db_group[m.group_id].id
            if m.note_id and m.note_id in old_note_id_to_new_db_note:
                m_dump["note_id"] = old_note_id_to_new_db_note[m.note_id].id
            if m.persona_id and m.persona_id in persona_map:
                m_dump["persona_id"] = persona_map[m.persona_id]
                
            db_msg = models.Message(**m_dump)
            db.add(db_msg)
            
        # 7. Reload References
        for r in data.references:
            db_ref = models.Reference(**r.model_dump(exclude={"tags", "linked_notes", "persons"}))
            for t in r.tags:
                if t.id in tag_map:
                    db_ref.tags.append(tag_map[t.id])
            db.add(db_ref)
        
        db.commit()
        # Broadcast that everything has changed
        await ws_manager.broadcast({"event": "framework_proposals_updated", "data": {"context": "import"}})
        return {"status": "success", "message": "Full atomic import completed with framework entities and outreach history"}
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
        "reference_count": db.query(models.Reference).count(),
        "message_count": db.query(models.Message).count()
    }

@app.get("/dashboard/calendar", response_model=List[schemas.CalendarDay])
def get_calendar_data(db: Session = Depends(get_db)):
    note_results = db.query(
        models.Note.date, 
        func.count(models.Note.id).label('count')
    ).group_by(models.Note.date).all()
    
    msg_results = db.query(
        models.Message.date,
        func.count(models.Message.id).label('m_count')
    ).group_by(models.Message.date).all()
    
    # Merge results into a map
    data_map = {}
    
    for r in note_results:
        d_str = r.date.isoformat()
        data_map[d_str] = {"date": r.date, "count": r.count, "message_count": 0}
        
    for r in msg_results:
        if not r.date: continue
        d_str = r.date
        if d_str in data_map:
            data_map[d_str]["message_count"] = r.m_count
        else:
            try:
                # Convert string YYYY-MM-DD back to date object for schema validation
                d_obj = datetime.strptime(d_str, "%Y-%m-%d").date()
                data_map[d_str] = {"date": d_obj, "count": 0, "message_count": r.m_count}
            except:
                continue
                
    return list(data_map.values())

@app.get("/dashboard/recent-notes", response_model=List[schemas.Note])
def get_recent_notes(limit: int = 5, db: Session = Depends(get_db)):
    return db.query(models.Note).order_by(models.Note.created_at.desc()).limit(limit).all()

@app.get("/dashboard/trends", response_model=List[schemas.TrendPoint])
def get_trends(db: Session = Depends(get_db)):
    # 1. Fetch all notes with tags and entity tags in one go to avoid N+1
    notes = db.query(models.Note).options(
        joinedload(models.Note.tags),
        joinedload(models.Note.person).joinedload(models.Person.tags),
        joinedload(models.Note.group).joinedload(models.Group.tags)
    ).all()

    if not notes:
        return []

    # 2. Analyze all available tag keys to find the "best" one for grouping
    # Metrics: Cardinality (fewer is better) and Coverage (more notes with the tag is better)
    key_metrics = {} # key -> {"values": Set, "coverage": int}
    
    for note in notes:
        # Collect all unique keys for this note (from note, person, or group)
        keys_in_this_note = set()
        
        # Helper to process tags
        def process_tags(tags):
            for t in tags:
                if t.key:
                    keys_in_this_note.add(t.key)
                    if t.key not in key_metrics:
                        key_metrics[t.key] = {"values": set(), "coverage": 0}
                    key_metrics[t.key]["values"].add(t.value)

        process_tags(note.tags)
        if note.person:
            process_tags(note.person.tags)
        if note.group:
            process_tags(note.group.tags)
        
        # Increment coverage for each key present in this note
        for k in keys_in_this_note:
            key_metrics[k]["coverage"] += 1

    # 3. Pick the best key
    # Preference: High coverage (minimize "None") and Low cardinality (clearer chart)
    selected_key = None
    best_score = -999999
    total_notes = len(notes)

    for k, metrics in key_metrics.items():
        cardinality = len(metrics["values"])
        coverage = metrics["coverage"]
        
        if cardinality == 0:
            continue
            
        # Score formula: 
        # (coverage_percent) - (cardinality * penalty)
        # This rewards keys that cover most notes but penalizes those with too many unique values.
        # Penalty of 5 means we'd trade 5% coverage for 1 fewer unique value.
        score = (coverage / total_notes * 100) - (cardinality * 5)
        
        if score > best_score:
            best_score = score
            selected_key = k

    # 4. Process trends by Month-Year (YYYY-MM)
    month_data = {} # "YYYY-MM" -> {"count": int, "stacks": {val: count}}
    
    for note in notes:
        m_key = note.date.strftime('%Y-%m')
        if m_key not in month_data:
            month_data[m_key] = {"count": 0, "stacks": {}}
        
        month_data[m_key]["count"] += 1
        
        # Determine stack value for the selected key
        stack_val = "None"
        if selected_key:
            # Priority: Note tags > Person tags > Group tags
            found_tag = next((t.value for t in note.tags if t.key == selected_key), None)
            if not found_tag and note.person:
                found_tag = next((t.value for t in note.person.tags if t.key == selected_key), None)
            if not found_tag and note.group:
                found_tag = next((t.value for t in note.group.tags if t.key == selected_key), None)
            
            if found_tag:
                stack_val = found_tag
        
        month_data[m_key]["stacks"][stack_val] = month_data[m_key]["stacks"].get(stack_val, 0) + 1

    # 5. Format result sorted chronologically
    sorted_keys = sorted(month_data.keys())
    result = []
    
    for k in sorted_keys:
        dt = datetime.strptime(k, '%Y-%m')
        label = dt.strftime('%b %Y')
        
        result.append({
            "label": label,
            "count": month_data[k]["count"],
            "stacks": [
                {"name": name, "count": count} 
                for name, count in month_data[k]["stacks"].items()
            ]
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


 
# (Removed duplicate get_local_ip)

@app.get("/dashboard/person-leaderboard", response_model=List[schemas.LeaderboardEntry])
def get_leaderboard(db: Session = Depends(database.get_db)):
    # People with most notes in the last 90 days
    three_months_ago = datetime.now() - timedelta(days=90)
    
    leaderboard = db.query(
        models.Person.id,
        models.Person.name,
        func.count(models.Note.id).label("note_count")
    ).join(models.Note, models.Note.person_id == models.Person.id)\
     .filter(models.Note.date >= three_months_ago)\
     .group_by(models.Person.id)\
     .order_by(func.count(models.Note.id).desc())\
     .limit(5).all()
    
    return [{"id": l[0], "name": l[1], "note_count": l[2]} for l in leaderboard]

if __name__ == "__main__":
    ip = get_local_ip()
    # Force 0.0.0.0 so companion mobile app can connect
    host = "0.0.0.0"
    print(f"Starting Paraclete Backend on {host}:8000 (Local IP: {ip})")
    uvicorn.run(app, host=host, port=8000)
