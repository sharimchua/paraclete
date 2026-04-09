from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel

try:
    from .. import models, schemas
    from ..database import get_db, SessionLocal
    from ..services.background_task_manager import background_manager
    from ..services.framework_analysis_job import run_framework_analysis
except ImportError:
    import models, schemas
    from database import get_db, SessionLocal
    from services.background_task_manager import background_manager
    from services.framework_analysis_job import run_framework_analysis

router = APIRouter(prefix="/framework", tags=["framework"])

@router.post("/analyze")
async def trigger_framework_analysis():
    """Triggers the background framework analysis job."""
    # We create a internal worker function that manages the session
    async def worker(interrupt_event):
        db = SessionLocal()
        try:
            await run_framework_analysis(db, interrupt_event=interrupt_event)
        finally:
            db.close()

    job_id = background_manager.add_job(
        "Framework Analysis", 
        worker,
        interrupt_event=True # Signals to pass the event
    )
    return {"status": "started", "job_id": job_id}

# --- Core Framework ---
@router.get("/core", response_model=schemas.PractiseFramework)
def read_core_framework(db: Session = Depends(get_db)):
    core = db.query(models.PractiseFramework).filter(models.PractiseFramework.is_core == True).first()
    if not core:
        # Create default core if not exists
        core = models.PractiseFramework(name="Global Core", is_core=True)
        db.add(core)
        db.commit()
        db.refresh(core)
    return core

@router.patch("/core", response_model=schemas.PractiseFramework)
def update_core_framework(framework: schemas.PractiseFrameworkCreate, db: Session = Depends(get_db)):
    core = db.query(models.PractiseFramework).filter(models.PractiseFramework.is_core == True).first()
    if not core:
        core = models.PractiseFramework(is_core=True)
        db.add(core)
    
    for key, value in framework.model_dump().items():
        if key != "is_core":
            setattr(core, key, value)
    
    db.commit()
    db.refresh(core)
    return core

@router.patch("/frameworks/{framework_id}", response_model=schemas.PractiseFramework)
def update_framework(framework_id: int, framework: schemas.PractiseFrameworkCreate, db: Session = Depends(get_db)):
    db_framework = db.query(models.PractiseFramework).filter(models.PractiseFramework.id == framework_id).first()
    if not db_framework:
        raise HTTPException(status_code=404, detail="Framework not found")
    
    for key, value in framework.model_dump().items():
        if key != "id" and key != "is_core":
            setattr(db_framework, key, value)
    
    db.commit()
    db.refresh(db_framework)
    return db_framework

# --- Personas ---
@router.post("/personas", response_model=schemas.Persona)
def create_persona(persona: schemas.PersonaCreate, db: Session = Depends(get_db)):
    # Create the framework first if not provided
    if not persona.framework_id:
        db_framework = models.PractiseFramework(name=f"{persona.name} Framework", is_core=False)
        db.add(db_framework)
        db.commit()
        db.refresh(db_framework)
        persona.framework_id = db_framework.id

    db_persona = models.Persona(**persona.model_dump())
    db.add(db_persona)
    db.commit()
    db.refresh(db_persona)
    return db_persona

@router.get("/personas", response_model=List[schemas.Persona])
def read_personas(db: Session = Depends(get_db)):
    return db.query(models.Persona).all()

@router.get("/personas/{persona_id}", response_model=schemas.Persona)
def read_persona(persona_id: int, db: Session = Depends(get_db)):
    persona = db.query(models.Persona).filter(models.Persona.id == persona_id).first()
    if not persona:
        raise HTTPException(status_code=404, detail="Persona not found")
    return persona

@router.patch("/personas/{persona_id}", response_model=schemas.Persona)
def update_persona(persona_id: int, persona: schemas.PersonaCreate, db: Session = Depends(get_db)):
    db_persona = db.query(models.Persona).filter(models.Persona.id == persona_id).first()
    if not db_persona:
        raise HTTPException(status_code=404, detail="Persona not found")
    
    for key, value in persona.model_dump().items():
        setattr(db_persona, key, value)
    
    db.commit()
    db.refresh(db_persona)
    return db_persona

@router.delete("/personas/{persona_id}")
def delete_persona(persona_id: int, db: Session = Depends(get_db)):
    db_persona = db.query(models.Persona).filter(models.Persona.id == persona_id).first()
    if not db_persona:
        raise HTTPException(status_code=404, detail="Persona not found")
    db.delete(db_persona)
    db.commit()
    return {"status": "success"}

# --- Proposals ---
@router.get("/proposals", response_model=List[schemas.FrameworkProposal])
def read_proposals(status: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(models.FrameworkProposal)
    if status:
        query = query.filter(models.FrameworkProposal.status == status)
    return query.order_by(models.FrameworkProposal.created_at.desc()).all()

class ProposalResolution(BaseModel):
    approved: bool

@router.post("/proposals/{proposal_id}/resolve")
def resolve_proposal(proposal_id: int, resolution: ProposalResolution, db: Session = Depends(get_db)):
    approved = resolution.approved
    proposal = db.query(models.FrameworkProposal).filter(models.FrameworkProposal.id == proposal_id).first()
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    
    if approved:
        proposal.status = models.FrameworkProposalStatus.ACCEPTED
        
        # Determine which framework to update
        target_framework = None
        if proposal.is_core:
            target_framework = db.query(models.PractiseFramework).filter(models.PractiseFramework.is_core == True).first()
        elif proposal.persona_id:
            persona = db.query(models.Persona).filter(models.Persona.id == proposal.persona_id).first()
            if persona:
                target_framework = db.query(models.PractiseFramework).filter(models.PractiseFramework.id == persona.framework_id).first()
        
        if target_framework:
            # Map aspect to model field
            field_map = {
                'formatting': 'formatting_preferences',
                'formatting preferences': 'formatting_preferences',
                'phrasing': 'common_phrasing',
                'common phrasing': 'common_phrasing',
                'tone': 'tone_idioms',
                'tone & idioms': 'tone_idioms',
                'principles': 'principles_tenets',
                'principles & tenets': 'principles_tenets'
            }
            
            field_name = field_map.get(proposal.aspect.lower())
            if field_name:
                current_val = getattr(target_framework, field_name) or ""
                if proposal.action == "Add":
                    # Smart append
                    if proposal.value not in current_val:
                        new_val = current_val + ("\n- " if "\n" in current_val or current_val else "- ") + proposal.value
                        setattr(target_framework, field_name, new_val)
                elif proposal.action == "Update":
                    # For now, append as update. In the future maybe regex replace.
                    new_val = current_val + "\n[Update] " + proposal.value
                    setattr(target_framework, field_name, new_val)
        
    else:
        proposal.status = models.FrameworkProposalStatus.REJECTED
    
    db.commit()
    return {"status": "success", "new_status": proposal.status}

# --- Entity Links (Personas to Persons/Groups) ---
class PersonaLink(BaseModel):
    persona_id: int
    entity_type: str # 'person' or 'group'
    entity_id: int

@router.post("/link")
def link_persona_to_entity(link: PersonaLink, db: Session = Depends(get_db)):
    if link.entity_type == "person":
        person = db.query(models.Person).filter(models.Person.id == link.entity_id).first()
        if not person:
            raise HTTPException(status_code=404, detail="Person not found")
        person.persona_id = link.persona_id
        db.commit()
    elif link.entity_type == "group":
        group = db.query(models.Group).filter(models.Group.id == link.entity_id).first()
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")
        group.persona_id = link.persona_id
        db.commit()
    else:
        raise HTTPException(status_code=400, detail="Invalid entity_type")
    
    return {"status": "success"}

@router.post("/link/person/{person_id}/{persona_id}")
def link_persona_to_person(person_id: int, persona_id: int, db: Session = Depends(get_db)):
    person = db.query(models.Person).filter(models.Person.id == person_id).first()
    persona = db.query(models.Persona).filter(models.Persona.id == persona_id).first()
    if not person or not persona:
        raise HTTPException(status_code=404, detail="Person or Persona not found")
    
    if persona not in person.personas:
        person.personas.append(persona)
        db.commit()
    return {"status": "success"}

@router.post("/link/group/{group_id}/{persona_id}")
def link_persona_to_group(group_id: int, persona_id: int, db: Session = Depends(get_db)):
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    persona = db.query(models.Persona).filter(models.Persona.id == persona_id).first()
    if not group or not persona:
        raise HTTPException(status_code=404, detail="Group or Persona not found")
    
    if persona not in group.personas:
        group.personas.append(persona)
        db.commit()
    return {"status": "success"}
