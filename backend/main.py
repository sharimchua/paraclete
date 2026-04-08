from fastapi import FastAPI, WebSocket, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List
import uvicorn
import socket
import os
import json

from . import models, schemas, database

# Ensure database tables exist (simple startup for prototype)
# In production, Alembic handles this.
models.Base.metadata.create_all(bind=database.engine)

app = FastAPI(title="Paraclete Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()

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

# --- Atomic Export/Import (Phase 2 Step 4.2) ---
@app.get("/export/", response_model=schemas.FullExport)
def export_data(db: Session = Depends(get_db)):
    return {
        "persons": db.query(models.Person).all(),
        "groups": db.query(models.Group).all(),
        "tags": db.query(models.Tag).all(),
        "notes": db.query(models.Note).all(),
        "references": db.query(models.Reference).all()
    }

@app.post("/import/")
def import_data(data: schemas.FullExport, db: Session = Depends(get_db)):
    # This acts as a single atomic SQL transaction
    try:
        # Simple implementation for Phase 2: clear and reload
        # In a real environment, we would handle merges or conflict resolution
        db.query(models.Person).delete()
        db.query(models.Group).delete()
        db.query(models.Tag).delete()
        db.query(models.Note).delete()
        db.query(models.Reference).delete()
        
        for p in data.persons: db.add(models.Person(**p.model_dump()))
        for g in data.groups: db.add(models.Group(**g.model_dump()))
        for t in data.tags: db.add(models.Tag(**t.model_dump()))
        for n in data.notes: db.add(models.Note(**n.model_dump()))
        for r in data.references: db.add(models.Reference(**r.model_dump()))
        
        db.commit()
        return {"status": "success", "message": "Atomic import completed"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

# --- WebSocket Support ---
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    await websocket.send_json({"event": "connected", "data": "Handshake successful"})
    try:
        while True:
            data = await websocket.receive_text()
            await websocket.send_json({"event": "echo", "data": data})
    except Exception:
        pass 

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
