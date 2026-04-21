from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
import json
import asyncio
import numpy as np

try:
    from .. import models, schemas, database, llm
    from ..database import get_db
except ImportError:
    import models, schemas, database, llm
    from database import get_db

router = APIRouter(prefix="/references", tags=["references"])

@router.post("/", response_model=schemas.Reference)
async def create_reference(reference: schemas.ReferenceCreate, db: Session = Depends(get_db)):
    db_ref = models.Reference(**reference.model_dump())
    db.add(db_ref)
    db.commit()
    db.refresh(db_ref)
    
    # Queue background embedding task
    asyncio.create_task(generate_reference_embedding(db_ref.id))
    
    return db_ref

@router.get("/proposals", response_model=List[schemas.ReferenceProposal])
async def get_reference_proposals(
    note_id: Optional[int] = None,
    status: str = "pending",
    db: Session = Depends(get_db)
):
    # Convert string status to Enum for SQL query
    try:
        status_enum = models.FrameworkProposalStatus[status.upper()]
    except:
        status_enum = models.FrameworkProposalStatus.PENDING
        
    query = db.query(models.ReferenceProposal).filter(models.ReferenceProposal.status == status_enum)
    if note_id:
        query = query.filter(models.ReferenceProposal.source_note_id == note_id)
    
    proposals = query.all()
    print(f"FORENSIC: Fetched {len(proposals)} proposals for note_id={note_id}, status={status}")
    return proposals

@router.get("/suggest", response_model=List[schemas.Reference])
async def suggest_references_endpoint(
    params: schemas.ReferenceSuggest = Depends(),
    db: Session = Depends(get_db)
):
    return await suggest_references(
        db=db,
        params=params
    )

@router.get("/", response_model=List[schemas.Reference])
def read_references(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(models.Reference).offset(skip).limit(limit).all()

@router.get("/{reference_id}", response_model=schemas.Reference)
def read_reference(reference_id: int, db: Session = Depends(get_db)):
    db_ref = db.query(models.Reference).filter(models.Reference.id == reference_id).first()
    if db_ref is None:
        raise HTTPException(status_code=404, detail="Reference not found")
    return db_ref

@router.patch("/{reference_id}", response_model=schemas.Reference)
async def update_reference(reference_id: int, reference: schemas.ReferenceCreate, db: Session = Depends(get_db)):
    db_ref = db.query(models.Reference).filter(models.Reference.id == reference_id).first()
    if db_ref is None:
        raise HTTPException(status_code=404, detail="Reference not found")
    
    # Check if content changed to re-trigger embedding and analysis
    content_changed = (db_ref.title != reference.title or db_ref.body != reference.body)
    
    for key, value in reference.model_dump().items():
        setattr(db_ref, key, value)
    
    if content_changed:
        db_ref.embedding_status = "pending"
        db_ref.analyzed_for_framework = False
    
    db.commit()
    db.refresh(db_ref)
    
    if content_changed:
        asyncio.create_task(generate_reference_embedding(db_ref.id))
        
    return db_ref

@router.delete("/{reference_id}")
def delete_reference(reference_id: int, db: Session = Depends(get_db)):
    db_ref = db.query(models.Reference).filter(models.Reference.id == reference_id).first()
    if db_ref is None:
        raise HTTPException(status_code=404, detail="Reference not found")
    db.delete(db_ref)
    db.commit()
    return {"status": "success"}

async def extract_references_task(note_id: int):
    """The actual background task for reference extraction."""
    from ..database import SessionLocal
    from ..websockets_manager import ws_manager
    from ..services.background_task_manager import background_manager
    
    db = SessionLocal()
    try:
        db_note = db.query(models.Note).filter(models.Note.id == note_id).first()
        if not db_note:
            print(f"FORENSIC ERROR: Note #{note_id} not found in database.")
            return
            
        text = f"{db_note.title}\n{db_note.cleaned_text or db_note.raw_capture or ''}"
        
        await ws_manager.broadcast({"event": "llm_start", "data": {"type": "reference_extraction", "prompt": "Extracting Professional Concepts"}})
        
        print(f"FORENSIC: Running extraction for Note #{note_id}...")
        raw_proposals = await llm.workflows.run_reference_extraction(text)
        print(f"FORENSIC: LLM returned {len(raw_proposals)} raw proposals.")
        
        # Deduplication logic
        existing_refs = db.query(models.Reference).all()
        existing_proposals = db.query(models.ReferenceProposal).filter(models.ReferenceProposal.source_note_id == note_id).all()
        
        batch_titles = set()
        added_count = 0
        for prop in raw_proposals:
            title_lower = prop['title'].strip().lower()
            
            # Skip if we already added it in this specific batch
            if title_lower in batch_titles:
                continue
            
            if any(r.title.lower() == title_lower for r in existing_refs):
                print(f"FORENSIC SKIP: '{prop['title']}' already exists in Reference Library.")
                continue
            if any(p.title.lower() == title_lower for p in existing_proposals):
                print(f"FORENSIC SKIP: '{prop['title']}' already exists as a Proposal for this note.")
                continue
            
            batch_titles.add(title_lower)
            new_prop = models.ReferenceProposal(
                title=prop['title'],
                type=prop['type'].upper(), # Force UPPERCASE to match DB Enum
                body=prop.get('body'),
                source_note_id=note_id,
                status=models.FrameworkProposalStatus.PENDING
            )
            db.add(new_prop)
            added_count += 1
            print(f"FORENSIC ADD: Added proposal '{prop['title']}' to session.")
        
        db.commit()
        print(f"FORENSIC SUCCESS: Committed {added_count} new proposals.")
        await ws_manager.broadcast({"event": "llm_finish", "data": {"type": "reference_extraction", "count": added_count}})
        
    except Exception as e:
        print(f"DEBUG: Extraction task error: {e}")
        await ws_manager.broadcast({"event": "llm_error", "data": str(e)})
    finally:
        db.close()

@router.post("/extract-from-note/{note_id}")
async def extract_references_from_note(note_id: int, db: Session = Depends(get_db)):
    from ..services.background_task_manager import background_manager
    
    # Check if a job for this note is already running
    active_jobs = background_manager.list_jobs()
    job_name = f"Extract Concepts: Note #{note_id}"
    if any(j["name"] == job_name and j["status"] in ["pending", "running"] for j in active_jobs):
        raise HTTPException(status_code=400, detail="Extraction already in progress for this note.")

    db_note = db.query(models.Note).filter(models.Note.id == note_id).first()
    if not db_note:
        raise HTTPException(status_code=404, detail="Note not found")
        
    background_manager.add_job(job_name, extract_references_task, note_id)
    return {"status": "queued", "job_name": job_name}

@router.post("/proposals/{proposal_id}/accept")
async def accept_reference_proposal(proposal_id: int, db: Session = Depends(get_db)):
    proposal = db.query(models.ReferenceProposal).filter(models.ReferenceProposal.id == proposal_id).first()
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    
    # Create the actual reference
    new_ref = models.Reference(
        title=proposal.title,
        type=proposal.type,
        body=proposal.body,
        source_note_id=proposal.source_note_id
    )
    db.add(new_ref)
    db.flush()
    
    # Link back to note
    note_ref = models.note_references.insert().values(
        note_id=proposal.source_note_id,
        reference_id=new_ref.id
    )
    db.execute(note_ref)
    
    # Mark proposal as accepted
    proposal.status = models.FrameworkProposalStatus.ACCEPTED
    db.commit()
    db.refresh(new_ref)
    
    return new_ref

@router.post("/proposals/{proposal_id}/reject")
async def reject_reference_proposal(proposal_id: int, db: Session = Depends(get_db)):
    proposal = db.query(models.ReferenceProposal).filter(models.ReferenceProposal.id == proposal_id).first()
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    
    proposal.status = models.FrameworkProposalStatus.REJECTED
    db.commit()
    return {"status": "rejected"}

async def suggest_references(
    db: Session,
    params: schemas.ReferenceSuggest
):
    """
    Hybrid Suggestion Logic:
    Semantic vector search hybridized with an explicit multiplier boost for occurrences 
    of shared Tags between the retrieved Reference and the current context.
    """
    context_tag_ids = set()
    effective_query = params.query

    if params.note_id:
        note = db.query(models.Note).filter(models.Note.id == params.note_id).first()
        if note:
            context_tag_ids.update([t.id for t in note.tags])
            if not effective_query:
                effective_query = f"{note.title} {note.cleaned_text or note.raw_capture or ''}"
    if params.person_id:
        person = db.query(models.Person).filter(models.Person.id == params.person_id).first()
        if person:
            context_tag_ids.update([t.id for t in person.tags])
    if params.group_id:
        group = db.query(models.Group).filter(models.Group.id == params.group_id).first()
        if group:
            context_tag_ids.update([t.id for t in group.tags])

    if not effective_query:
        return []

    from ..websockets_manager import ws_manager
    await ws_manager.broadcast({"event": "llm_start", "data": {"type": "reference_suggestion", "prompt": "Finding relevant references"}})
    
    try:
        query_embedding_resp = await llm.llm_manager.aembed(effective_query)
        
        if not query_embedding_resp:
            await ws_manager.broadcast({"event": "llm_finish", "data": {"type": "reference_suggestion"}})
            return []
            
        q_vec = np.array(query_embedding_resp["data"][0]["embedding"])
        norm_q = np.linalg.norm(q_vec)
        
        if norm_q == 0:
            await ws_manager.broadcast({"event": "llm_finish", "data": {"type": "reference_suggestion"}})
            return []

        all_refs = db.query(models.Reference).all()
        scored_refs = []
        
        for ref in all_refs:
            # 1. Semantic Score
            sem_score = 0.0
            if ref.embedding:
                r_vec = np.array(json.loads(ref.embedding.vector))
                norm_r = np.linalg.norm(r_vec)
                if norm_r > 0:
                    sem_score = np.dot(q_vec, r_vec) / (norm_q * norm_r)
            
            # 2. Tag Boost
            tag_match_count = 0
            if context_tag_ids:
                ref_tag_ids = set([t.id for t in ref.tags])
                tag_match_count = len(context_tag_ids.intersection(ref_tag_ids))
            
            # Boost formula: semantic_score * (1 + 0.2 * matches)
            final_score = sem_score * (1.0 + (0.2 * tag_match_count))
            scored_refs.append((final_score, ref))
        
        scored_refs.sort(key=lambda x: x[0], reverse=True)
        results = [r for score, r in scored_refs[:params.limit]]
        await ws_manager.broadcast({"event": "llm_finish", "data": {"type": "reference_suggestion", "count": len(results)}})
        return results
    except Exception as e:
        await ws_manager.broadcast({"event": "llm_error", "data": str(e)})
        return []


async def generate_reference_embedding(reference_id: int):
    """Background task to generate embedding for a reference."""
    # We need a new session for background tasks usually, but here we'll use a local one
    from ..database import SessionLocal
    db = SessionLocal()
    try:
        db_ref = db.query(models.Reference).filter(models.Reference.id == reference_id).first()
        if not db_ref:
            return
            
        embed_text = f"{db_ref.title} {db_ref.body}"
        embed_response = await llm.llm_manager.aembed(embed_text)
        
        if embed_response:
            vector = embed_response["data"][0]["embedding"]
            # Update or create embedding
            if db_ref.embedding:
                db_ref.embedding.vector = json.dumps(vector)
            else:
                db_emb = models.ReferenceEmbedding(reference_id=db_ref.id, vector=json.dumps(vector))
                db.add(db_emb)
            
            db_ref.embedding_status = "complete"
            db.commit()
    except Exception as e:
        print(f"Error generating embedding for reference {reference_id}: {e}")
        if db_ref:
            db_ref.embedding_status = "error"
            db.commit()
    finally:
        db.close()
