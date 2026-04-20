import json
import asyncio
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel

try:
    from .. import models, schemas
    from ..database import get_db, SessionLocal
    from ..services.background_task_manager import background_manager
except ImportError:
    import models, schemas
    from database import get_db, SessionLocal
    from services.background_task_manager import background_manager

router = APIRouter(prefix="/framework", tags=["framework"])

@router.get("/pending-count")
async def get_pending_count(
    person_id: Optional[int] = None,
    group_id: Optional[int] = None,
    persona_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """Returns the number of un-analysed artifacts for the given scope."""
    db.expire_all() 
    from ..services.framework_analysis_job import get_pending_analysis_count
    counts = await get_pending_analysis_count(
        db, person_id=person_id, group_id=group_id, persona_id=persona_id
    )
    return counts

@router.get("/audit")
async def get_framework_audit(persona_id: Optional[int] = None, db: Session = Depends(get_db)):
    # 1. Fetch hierarchy
    core_fw = db.query(models.PractiseFramework).filter(models.PractiseFramework.is_core == True).first()
    core_text = "\n".join([f"- [{i.aspect}]: {i.value}" for i in core_fw.items]) if core_fw else "None"
    
    persona_text = "None"
    persona_name = "Selected Persona"
    if persona_id:
        persona = db.query(models.Persona).filter(models.Persona.id == persona_id).first()
        if persona:
            persona_name = persona.name
            if persona.framework:
                persona_text = "\n".join([f"- [{i.aspect}]: {i.value}" for i in persona.framework.items])

    # 2. Run LLM Audit
    from ..llm import templates, llm_manager
    prompt = templates.audit_framework(core_text, persona_text)
    
    from ..websockets_manager import ws_manager
    await ws_manager.broadcast({"event": "llm_start", "data": {"type": "framework_audit", "prompt": "Auditing Practice Framework"}})
    
    try:
        resp = await asyncio.to_thread(
            llm_manager.call, 
            prompt, 
            system="You are an expert professional practice auditor. Identify contradictions between Core and Persona levels."
        )
        
        # Simple extraction
        clean_json = resp.strip()
        if "```json" in clean_json:
            clean_json = clean_json.split("```json")[1].split("```")[0].strip()
        elif "```" in clean_json:
            clean_json = clean_json.split("```")[1].split("```")[0].strip()
            
        await ws_manager.broadcast({"event": "llm_finish", "data": {"type": "framework_audit"}})
        return json.loads(clean_json)
    except Exception as e:
        await ws_manager.broadcast({"event": "llm_error", "data": str(e)})
        return {"conflicts": [], "error": str(e)}

@router.post("/analyze")
async def trigger_framework_analysis(
    person_id: Optional[int] = None,
    group_id: Optional[int] = None,
    persona_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """Triggers the background framework analysis for each un-analysed entity."""
    from ..services.framework_analysis_job import run_item_analysis_task
    from sqlalchemy import or_

    # 1. Fetch un-analysed entries
    note_query = db.query(models.Note.id).filter(
        or_(models.Note.analyzed_for_framework == False, models.Note.analyzed_for_framework == None),
        models.Note.stage == models.NoteStage.PUBLISHED
    )
    msg_query = db.query(models.Message.id).filter(or_(models.Message.analyzed_for_framework == False, models.Message.analyzed_for_framework == None))
    ref_query = db.query(models.Reference.id).filter(or_(models.Reference.analyzed_for_framework == False, models.Reference.analyzed_for_framework == None))

    if person_id:
        note_query = note_query.filter(models.Note.person_id == person_id)
        msg_query = msg_query.join(models.Note).filter(models.Note.person_id == person_id)
        ref_query = ref_query.filter(models.Reference.persons.any(models.Person.id == person_id))
    elif group_id:
        group_filter = or_(
            models.Note.group_id == group_id,
            models.Note.person.has(models.Person.groups.any(models.Group.id == group_id))
        )
        note_query = note_query.filter(group_filter)
        msg_query = msg_query.join(models.Note).filter(group_filter)
        ref_query = ref_query.filter(
            or_(
                models.Reference.linked_notes.any(group_filter),
                models.Reference.persons.any(models.Person.groups.any(models.Group.id == group_id))
            )
        )
    elif persona_id:
        note_query = note_query.filter(
            or_(models.Note.person.has(models.Person.persona_id == persona_id), models.Note.group.has(models.Group.persona_id == persona_id))
        )
        msg_query = msg_query.join(models.Note).filter(
            or_(models.Note.person.has(models.Person.persona_id == persona_id), models.Note.group.has(models.Group.persona_id == persona_id))
        )
        ref_query = ref_query.filter(
            models.Reference.linked_notes.any(
                or_(models.Note.person.has(models.Person.persona_id == persona_id), models.Note.group.has(models.Group.persona_id == persona_id))
            )
        )

    # 2. Worker wrapper to handle DB session injection
    async def worker_wrapper(item_type, item_id, interrupt_event):
        # We need a fresh session for each job because they run in the background worker loop
        local_db = SessionLocal()
        try:
             await run_item_analysis_task(
                 local_db, item_type, item_id, 
                 interrupt_event=interrupt_event,
                 force_person_id=person_id,
                 force_group_id=group_id,
                 force_persona_id=persona_id
             )
        finally:
            local_db.close()

    # 3. Queue jobs
    job_ids = []
    
    # Notes
    for (nid,) in note_query.all():
        jid = background_manager.add_job(f"Analyse Note {nid}", worker_wrapper, item_type="note", item_id=nid, interrupt_event=True)
        job_ids.append(jid)
    
    # Messages
    for (mid,) in msg_query.all():
        jid = background_manager.add_job(f"Analyse Message {mid}", worker_wrapper, item_type="message", item_id=mid, interrupt_event=True)
        job_ids.append(jid)
        
    # References
    for (rid,) in ref_query.all():
        jid = background_manager.add_job(f"Analyse Reference {rid}", worker_wrapper, item_type="reference", item_id=rid, interrupt_event=True)
        job_ids.append(jid)

    from ..websockets_manager import ws_manager
    await ws_manager.broadcast({"event": "framework_proposals_updated", "data": {"reason": "analysis_started"}})
    return {"status": "started", "job_count": len(job_ids), "job_ids": job_ids}

def stitch_framework(db_fw: models.PractiseFramework):
    """Aggregate discrete items into virtual text fields for the GUI."""
    if not db_fw: return db_fw
    
    by_aspect = {
        'tone': [],
        'formatting': [],
        'phrasing': [],
        'principles': []
    }
    
    # Map from alternate names or plural to our standard set
    map = {
        'tone': 'tone', 'tone & idioms': 'tone', 'idioms': 'tone',
        'formatting': 'formatting', 'formatting preferences': 'formatting',
        'phrasing': 'phrasing', 'common phrasing': 'phrasing',
        'principles': 'principles', 'principles & tenets': 'principles', 'tenets': 'principles'
    }

    for item in db_fw.items:
        key = map.get(item.aspect.lower(), 'principles')
        by_aspect[key].append(item.value)

    db_fw.tone_idioms = "\n".join(by_aspect['tone'])
    db_fw.formatting_preferences = "\n".join(by_aspect['formatting'])
    db_fw.common_phrasing = "\n".join(by_aspect['phrasing'])
    db_fw.principles_tenets = "\n".join(by_aspect['principles'])
    return db_fw

def parse_and_sync_items(db: Session, db_fw: models.PractiseFramework, framework_data: schemas.PractiseFrameworkCreate):
    """Parse text blocks into individual items and sync with DB."""
    aspect_map = {
        'tone_idioms': 'Tone',
        'formatting_preferences': 'Formatting',
        'common_phrasing': 'Phrasing',
        'principles_tenets': 'Principles'
    }

    for field, aspect in aspect_map.items():
        text = getattr(framework_data, field)
        if text is None: continue

        # 1. Clean and split into individual bullets
        lines = [line.strip().lstrip('-').strip() for line in text.split('\n') if line.strip()]
        
        # 2. Get existing items for this aspect
        existing_items = {i.value: i for i in db_fw.items if i.aspect == aspect}
        
        # 3. Add new ones
        for val in lines:
            if val not in existing_items:
                new_item = models.PractiseFrameworkItem(
                    framework_id=db_fw.id,
                    aspect=aspect,
                    value=val
                )
                db.add(new_item)
            else:
                # Remove from dict so we know it's still present
                del existing_items[val]
        
        # 4. Remove items that were deleted in the text block
        for old_item in existing_items.values():
            db.delete(old_item)

# --- Core Framework ---
@router.get("/core", response_model=schemas.PractiseFramework)
def read_core_framework(db: Session = Depends(get_db)):
    core = db.query(models.PractiseFramework).filter(models.PractiseFramework.is_core == True).first()
    if not core:
        core = models.PractiseFramework(name="Global Core", is_core=True)
        db.add(core)
        db.commit()
        db.refresh(core)
    return stitch_framework(core)

@router.patch("/core", response_model=schemas.PractiseFramework)
def update_core_framework(framework: schemas.PractiseFrameworkCreate, db: Session = Depends(get_db)):
    core = db.query(models.PractiseFramework).filter(models.PractiseFramework.is_core == True).first()
    if not core:
        core = models.PractiseFramework(is_core=True)
        db.add(core)
        db.commit()
        db.refresh(core)
    
    # Update base fields
    if framework.name: core.name = framework.name
    
    # Sync items
    parse_and_sync_items(db, core, framework)
    
    db.commit()
    db.refresh(core)
    return stitch_framework(core)

@router.patch("/frameworks/{framework_id}", response_model=schemas.PractiseFramework)
def update_framework(framework_id: int, framework: schemas.PractiseFrameworkCreate, db: Session = Depends(get_db)):
    db_framework = db.query(models.PractiseFramework).filter(models.PractiseFramework.id == framework_id).first()
    if not db_framework:
        raise HTTPException(status_code=404, detail="Framework not found")
    
    if framework.name: db_framework.name = framework.name
    parse_and_sync_items(db, db_framework, framework)
    
    # Check if this is a custom framework that is now empty
    db.flush() # Ensure items are updated in relationship
    if not db_framework.items and not db_framework.is_core:
        # Check if any persona uses this (Personas frameworks stay even if empty)
        persona_link = db.query(models.Persona).filter(models.Persona.framework_id == db_framework.id).first()
        if not persona_link:
            # It's a custom Person/Group framework. If empty, wipe the container.
            db.query(models.Person).filter(models.Person.custom_framework_id == db_framework.id).update({"custom_framework_id": None})
            db.query(models.Group).filter(models.Group.custom_framework_id == db_framework.id).update({"custom_framework_id": None})
            db.delete(db_framework)
            db.commit()
            return {"id": framework_id, "is_core": False, "items": [], "name": "Deleted"} # Return a dummy for the response model then refresh

    db.commit()
    db.refresh(db_framework)
    return stitch_framework(db_framework)

@router.delete("/frameworks/{framework_id}")
def delete_framework(framework_id: int, db: Session = Depends(get_db)):
    """Deletes a framework and unlinks it from any owners."""
    db_framework = db.query(models.PractiseFramework).filter(models.PractiseFramework.id == framework_id).first()
    if not db_framework:
        raise HTTPException(status_code=404, detail="Framework not found")
    
    if db_framework.is_core:
        raise HTTPException(status_code=403, detail="Cannot delete core framework")

    # Unlink from entities
    db.query(models.Person).filter(models.Person.custom_framework_id == framework_id).update({"custom_framework_id": None})
    db.query(models.Group).filter(models.Group.custom_framework_id == framework_id).update({"custom_framework_id": None})
    db.query(models.Persona).filter(models.Persona.framework_id == framework_id).update({"framework_id": None})
    
    db.delete(db_framework)
    db.commit()
    return {"status": "success"}

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
    personas = db.query(models.Persona).all()
    for p in personas:
        if p.framework:
            stitch_framework(p.framework)
    return personas

@router.get("/personas/{persona_id}", response_model=schemas.Persona)
def read_persona(persona_id: int, db: Session = Depends(get_db)):
    persona = db.query(models.Persona).filter(models.Persona.id == persona_id).first()
    if not persona:
        raise HTTPException(status_code=404, detail="Persona not found")
    if persona.framework:
        stitch_framework(persona.framework)
    return persona

@router.patch("/personas/{persona_id}", response_model=schemas.Persona)
def update_persona(persona_id: int, persona: schemas.PersonaUpdate, db: Session = Depends(get_db)):
    db_persona = db.query(models.Persona).filter(models.Persona.id == persona_id).first()
    if not db_persona:
        raise HTTPException(status_code=404, detail="Persona not found")
    
    update_data = persona.model_dump(exclude_unset=True)
    for key, value in update_data.items():
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
        # Handle case-insensitive status filtering to match DB Enum names
        s = status.upper()
        if s in models.FrameworkProposalStatus.__members__:
            query = query.filter(models.FrameworkProposal.status == models.FrameworkProposalStatus[s])
        else:
            query = query.filter(models.FrameworkProposal.status == status)
    query = query.order_by(models.FrameworkProposal.created_at.desc())
    proposals = query.all()
    
    # Hydrate on the fly
    # Convert to Pydantic objects for hydration
    output = []
    for p in proposals:
        p_out = schemas.FrameworkProposal.model_validate(p)
        source_note = None
        if p.source_type == "Note":
            source_note = db.query(models.Note).filter(models.Note.id == p.source_id).first()
            if source_note:
                p_out.source_context = f"Note: {source_note.title}"
        elif p.source_type == "Message":
            msg = db.query(models.Message).filter(models.Message.id == p.source_id).first()
            if msg and msg.note:
                source_note = msg.note
                p_out.source_context = f"Message for: {source_note.title}"
            else:
                p_out.source_context = "Draft Message"
        elif p.source_type == "Reference":
            ref = db.query(models.Reference).filter(models.Reference.id == p.source_id).first()
            if ref:
                p_out.source_context = f"Reference: {ref.title}"
                source_note = ref.source_note
        elif p.source_type == "Synthesis":
            p_out.source_context = "AI Synthesis Job"
        
        # 2. Trace Hierarchy for Dynamic Target Inference
        if source_note:
            p_out.source_date = source_note.date.strftime("%Y-%m-%d") if source_note.date else "Unknown"
            
            # Potential target: The Person
            if source_note.person:
                p_out.source_owner = f"Person: {source_note.person.name}"
                p_out.person_id = source_note.person.id
                p_out.person_name = source_note.person.name
                
                # Potential targets: All Groups the person currently belongs to
                if source_note.person.groups:
                    p_out.possible_groups = [schemas.GroupBadge.model_validate(g) for g in source_note.person.groups]
                
                # Potential target: The Persona currently linked to this person
                if source_note.person.persona_id and not p_out.persona_id:
                     p_out.persona_id = source_note.person.persona_id
                     p_out.persona_name = source_note.person.persona.name if source_note.person.persona else f"Persona {p_out.persona_id}"

            # Potential target: The Group (if note is directly against a group)
            elif source_note.group:
                p_out.source_owner = f"Group: {source_note.group.name}"
                p_out.group_id = source_note.group.id
                p_out.group_name = source_note.group.name
                
                # Potential target: The Persona currently linked to this group
                if source_note.group.persona_id and not p_out.persona_id:
                     p_out.persona_id = source_note.group.persona_id
                     p_out.persona_name = source_note.group.persona.name if source_note.group.persona else f"Persona {p_out.persona_id}"
            else:
                p_out.source_owner = "Generic"
        
        # Hydrate names for all potential targets
        if p.persona and not p_out.persona_name:
            p_out.persona_name = p.persona.name
        if p.person and not p_out.person_name:
            p_out.person_name = p.person.name
        if p.group and not p_out.group_name:
            p_out.group_name = p.group.name
            
        # Fallback hydration just in case relationships aren't loaded or IDs were manually set
        if p_out.persona_id and not p_out.persona_name:
            persona = db.query(models.Persona).filter(models.Persona.id == p_out.persona_id).first()
            if persona: p_out.persona_name = persona.name
        if p_out.group_id and not p_out.group_name:
            group = db.query(models.Group).filter(models.Group.id == p_out.group_id).first()
            if group: p_out.group_name = group.name
        if p_out.person_id and not p_out.person_name:
            person = db.query(models.Person).filter(models.Person.id == p_out.person_id).first()
            if person: p_out.person_name = person.name

        output.append(p_out)
            
    return output

class MoveItemRequest(BaseModel):
    target_type: str
    target_id: Optional[int] = None

class ProposalResolution(BaseModel):
    approved: bool
    override_persona_id: Optional[int] = None
    override_person_id: Optional[int] = None
    override_group_id: Optional[int] = None
    override_is_core: Optional[bool] = None

@router.post("/proposals/{proposal_id}/resolve")
async def resolve_proposal(proposal_id: int, resolution: ProposalResolution, db: Session = Depends(get_db)):
    approved = resolution.approved
    proposal = db.query(models.FrameworkProposal).filter(models.FrameworkProposal.id == proposal_id).first()
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    
    if approved:
        proposal.status = models.FrameworkProposalStatus.ACCEPTED
        
        # Use overrides if provided, otherwise fall back to proposal defaults
        effective_is_core = resolution.override_is_core if resolution.override_is_core is not None else proposal.is_core
        effective_persona_id = resolution.override_persona_id if resolution.override_persona_id is not None else proposal.persona_id
        effective_person_id = resolution.override_person_id if resolution.override_person_id is not None else proposal.person_id
        effective_group_id = resolution.override_group_id if resolution.override_group_id is not None else proposal.group_id

        # Determine which framework to update
        target_framework = None
        if effective_person_id:
            person = db.query(models.Person).filter(models.Person.id == effective_person_id).first()
            if person:
                if not person.custom_framework_id:
                    person.custom_framework = models.PractiseFramework(name=f"{person.name} Custom", is_core=False)
                    db.commit()
                target_framework = person.custom_framework
        elif effective_group_id:
            group = db.query(models.Group).filter(models.Group.id == effective_group_id).first()
            if group:
                if not group.custom_framework_id:
                    group.custom_framework = models.PractiseFramework(name=f"{group.name} Custom", is_core=False)
                    db.commit()
                target_framework = group.custom_framework
        elif effective_persona_id:
            persona = db.query(models.Persona).filter(models.Persona.id == effective_persona_id).first()
            if persona:
                target_framework = db.query(models.PractiseFramework).filter(models.PractiseFramework.id == persona.framework_id).first()
        elif effective_is_core:
            target_framework = db.query(models.PractiseFramework).filter(models.PractiseFramework.is_core == True).first()
        
        if target_framework:
            # Aspect mapping is now handled by the item model's 'aspect' field directly.
            # We look for an existing item with the same aspect and value to avoid duplicates,
            # or we create a new one.
            
            existing_item = db.query(models.PractiseFrameworkItem).filter(
                models.PractiseFrameworkItem.framework_id == target_framework.id,
                models.PractiseFrameworkItem.aspect == proposal.aspect,
                models.PractiseFrameworkItem.value == proposal.value
            ).first()

            if not existing_item:
                new_item = models.PractiseFrameworkItem(
                    framework_id=target_framework.id,
                    aspect=proposal.aspect,
                    value=proposal.value
                )
                db.add(new_item)
            # If it exists, we just confirm the resolution of the proposal.
        
    else:
        proposal.status = models.FrameworkProposalStatus.REJECTED
    
    db.commit()
    from ..websockets_manager import ws_manager
    await ws_manager.broadcast({"event": "framework_proposals_updated", "data": {"reason": "proposal_resolved"}})
    return {"status": "success", "new_status": proposal.status}

@router.post("/proposals/reject-all")
async def reject_all_pending_proposals(db: Session = Depends(get_db)):
    """Convenience method to clear the analysis queue."""
    db.query(models.FrameworkProposal).filter(models.FrameworkProposal.status == models.FrameworkProposalStatus.PENDING).update({models.FrameworkProposal.status: models.FrameworkProposalStatus.REJECTED})
    db.commit()
    from ..websockets_manager import ws_manager
    await ws_manager.broadcast({"event": "framework_proposals_updated", "data": {"reason": "all_rejected"}})
    return {"status": "success"}

@router.get("/custom")
def read_custom_frameworks(db: Session = Depends(get_db)):
    """Returns Persons and Groups that have custom frameworks."""
    persons = db.query(models.Person).filter(models.Person.custom_framework_id != None).all()
    groups = db.query(models.Group).filter(models.Group.custom_framework_id != None).all()
    
    result = []
    for p in persons:
        stitch_framework(p.custom_framework)
        result.append({
            "type": "person", 
            "id": p.id, 
            "name": p.name, 
            "framework": p.custom_framework,
            "persona_id": p.persona_id
        })
    for g in groups:
        stitch_framework(g.custom_framework)
        result.append({
            "type": "group", 
            "id": g.id, 
            "name": g.name, 
            "framework": g.custom_framework,
            "persona_id": g.persona_id
        })
    return result

@router.post("/custom/{entity_type}/{entity_id}")
async def create_custom_framework(entity_type: str, entity_id: int, db: Session = Depends(get_db)):
    """Manually creates a custom framework for a person or group."""
    if entity_type == "person":
        entity = db.query(models.Person).filter(models.Person.id == entity_id).first()
    elif entity_type == "group":
        entity = db.query(models.Group).filter(models.Group.id == entity_id).first()
    else:
        raise HTTPException(status_code=400, detail="Invalid entity type")
    
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")
        
    if entity.custom_framework_id:
        return {"status": "exists", "id": entity.custom_framework_id}
        
    fw = models.PractiseFramework(name=f"{entity.name} Overrides", is_core=False)
    db.add(fw)
    db.flush() # Get ID before commit if needed, though commit handles it
    
    entity.custom_framework_id = fw.id
    db.commit()
    db.refresh(fw)
    
    return {"status": "created", "id": fw.id}

@router.get("/consolidated/{entity_type}/{entity_id}")
async def get_consolidated_framework(entity_type: str, entity_id: int, db: Session = Depends(get_db)):
    """Merges Core + Persona + Custom items into a single view."""
    from ..services.framework_resolver import resolve_framework_items
    
    persona_id = None
    person_id = None
    group_id = None
    
    if entity_type == "person":
        person_id = entity_id
        person = db.query(models.Person).filter(models.Person.id == entity_id).first()
        if person: persona_id = person.persona_id
    elif entity_type == "group":
        group_id = entity_id
        group = db.query(models.Group).filter(models.Group.id == entity_id).first()
        if group: persona_id = group.persona_id
    elif entity_type == "persona":
        persona_id = entity_id

    # We want a structured response, not just text
    # But resolve_framework_items returns text. Let's see if we can get items.
    # For now, we'll return the text but wrapped.
    # We want a structured response, not just text
    from ..services.framework_resolver import resolve_framework_items, get_resolved_framework_data
    text = resolve_framework_items(db, persona_id=persona_id, person_id=person_id, group_id=group_id)
    structured_data = get_resolved_framework_data(db, persona_id=persona_id, person_id=person_id, group_id=group_id)
    
    return {
        "consolidated_text": text,
        "structured_data": structured_data
    }

@router.post("/proposals/reject-all")
def reject_all_proposals(db: Session = Depends(get_db)):
    """Rejects all pending framework proposals."""
    db.query(models.FrameworkProposal).filter(
        models.FrameworkProposal.status == models.FrameworkProposalStatus.PENDING
    ).update({"status": models.FrameworkProposalStatus.REJECTED})
    db.commit()
    return {"status": "success"}

# --- Entity Links (Personas to Persons/Groups) ---
class PersonaLink(BaseModel):
    persona_id: int
    entity_type: str # 'person' or 'group'
    entity_id: int

@router.post("/proposals/synthesize")
async def synthesize_all_proposals(db: Session = Depends(get_db)):
    """Merges and de-duplicates all pending proposals using the LLM."""
    proposals = db.query(models.FrameworkProposal)\
        .filter(models.FrameworkProposal.status == models.FrameworkProposalStatus.PENDING)\
        .order_by(models.FrameworkProposal.created_at.desc())\
        .limit(50).all()
    if not proposals:
        return {"status": "success", "count": 0}

    # Group and stringify
    prop_list = []
    for p in proposals:
        prop_list.append(f"ID: {p.id} | Aspect: {p.aspect} | Action: {p.action} | Value: {p.value} | Scope: {'Core' if p.is_core else f'Persona {p.persona_id}'}")
    
    proposals_text = "\n".join(prop_list)

    try:
        from .. import llm
    except ImportError:
        import llm
    import json
    import asyncio
    import traceback

    from ..websockets_manager import ws_manager
    await ws_manager.broadcast({"event": "llm_start", "data": {"type": "framework_synthesis", "prompt": f"Synthesizing {len(proposals)} proposals"}})
    
    try:
        print(f"DEBUG: Starting synthesis of {len(proposals)} proposals...")
        
        # Offload to thread for safety
        result_text = await asyncio.to_thread(
            llm.llm_manager.call,
            prompt=llm.templates.synthesize_proposals(proposals_text)
        )
        
        print(f"DEBUG: LLM synthesis response received. Length: {len(result_text)}")
        
        # Parse JSON
        start_idx = result_text.find('{')
        end_idx = result_text.rfind('}') + 1
        if start_idx == -1 or end_idx == 0:
            print(f"DEBUG: LLM response did not contain JSON. Content: {result_text[:500]}...")
            raise HTTPException(status_code=500, detail="LLM response did not contain a valid JSON object.")
        
        json_str = result_text[start_idx:end_idx]
        try:
            data = json.loads(json_str)
        except json.JSONDecodeError as je:
            print(f"DEBUG: JSON decode error: {je}. Fragment: {json_str[:200]}")
            raise HTTPException(status_code=500, detail=f"Failed to parse LLM synthesis JSON: {je}")

        new_proposals = data.get("proposals", [])
        print(f"DEBUG: Synthesis complete. Generated {len(new_proposals)} merged proposals.")

        # Mark old as superseded
        for p in proposals:
            p.status = models.FrameworkProposalStatus.SUPERSEDED
        
        # Add new ones
        for np in new_proposals:
            db_prop = models.FrameworkProposal(
                source_type="Synthesis",
                source_id=0,
                aspect=np.get("aspect", "Miscellaneous"),
                action=np.get("action", "Add"),
                value=np.get("value", ""),
                is_core=True, # Default to core for synthesis, user can retarget
                status=models.FrameworkProposalStatus.PENDING
            )
            db.add(db_prop)
        
        db.commit()
        await ws_manager.broadcast({"event": "llm_finish", "data": {"type": "framework_synthesis", "result": "Synthesis Complete"}})
        return {"status": "success", "count": len(new_proposals)}

    except HTTPException as e:
        await ws_manager.broadcast({"event": "llm_error", "data": str(e)})
        raise
    except Exception as e:
        print(f"ERROR in synthesis: {e}")
        print(traceback.format_exc())
        await ws_manager.broadcast({"event": "llm_error", "data": str(e)})
        raise HTTPException(status_code=500, detail=str(e))

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

@router.post("/draft-message")
async def draft_persona_message(
    note_id: int, 
    persona_id: Optional[int] = None, 
    db: Session = Depends(get_db)
):
    note = db.query(models.Note).filter(models.Note.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    # Hierarchical Persona Resolution & Context Augmentation
    effective_persona_id = persona_id
    overrides = []
    entity_name = "the recipient"

    if not effective_persona_id:
        if note.person:
            entity_name = note.person.name
            effective_persona_id = note.person.persona_id
            if note.person.tags:
                overrides.append(f"Individual Overrides ({note.person.name}): " + ", ".join([f"{t.key}: {t.value}" for t in note.person.tags]))
            
            # Inheritance if no direct persona
            if not effective_persona_id and note.person.groups:
                for g in note.person.groups:
                    if g.persona_id:
                        effective_persona_id = g.persona_id
                        overrides.append(f"Inherited Group Context ({g.name}): {g.description or ''}")
                        break
        elif note.group:
            entity_name = note.group.name
            effective_persona_id = note.group.persona_id
            if note.group.description:
                overrides.append(f"Group Context ({note.group.name}): {note.group.description}")

    if not effective_persona_id:
        raise HTTPException(status_code=400, detail="No professional persona linked or inherited for this session.")

    persona = db.query(models.Persona).filter(models.Persona.id == effective_persona_id).first()
    if not persona:
        raise HTTPException(status_code=404, detail="Persona not found")
        
    # Assemble augmented bio with Framework Tokens
    from ..services.framework_resolver import resolve_framework_items
    framework_context = resolve_framework_items(db, persona_id=effective_persona_id, person_id=note.person_id, group_id=note.group_id)
    
    augmented_bio = (persona.description or "") + "\n\n### PRACTISE FRAMEWORK CONSTRAINTS:\n" + framework_context

    if overrides:
        augmented_bio += "\n\n### ENTITY-SPECIFIC OVERRIDES:\n" + "\n".join(overrides)
        
    # Get relevant refs for context
    from backend.routers.references import suggest_references
    refs = await suggest_references(note_id=note_id, db=db, limit=3)
    refs_text = "\n".join([f"- {r.title}: {r.body[:500]}" for r in refs])
    
    # Run LLM
    from backend import llm
    from ..websockets_manager import ws_manager
    await ws_manager.broadcast({"event": "llm_start", "data": {"type": "persona_draft", "prompt": f"Drafting message for {entity_name}"}})
    
    try:
        draft = await llm.workflows.run_persona_draft(
            note_content=note.cleaned_text or note.raw_capture or "",
            persona_name=persona.name,
            persona_bio=augmented_bio,
            references=refs_text
        )
        await ws_manager.broadcast({"event": "llm_finish", "data": {"type": "persona_draft", "result": "Draft Complete"}})
        return {
            "draft": draft,
            "persona_id": persona.id,
            "persona_name": persona.name,
            "is_inherited": (persona_id is None and effective_persona_id != (note.person.persona_id if note.person else None))
        }
    except Exception as e:
        await ws_manager.broadcast({"event": "llm_error", "data": str(e)})
        raise HTTPException(status_code=500, detail=str(e))
@router.post("/items/{item_id}/move")
async def move_framework_item(
    item_id: int, 
    request: MoveItemRequest, 
    db: Session = Depends(get_db)
):
    target_type = request.target_type
    target_id = request.target_id
    item = db.query(models.PractiseFrameworkItem).filter(models.PractiseFrameworkItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    target_framework = None
    if target_type == "core":
        target_framework = db.query(models.PractiseFramework).filter(models.PractiseFramework.is_core == True).first()
    elif target_type == "persona":
        persona = db.query(models.Persona).filter(models.Persona.id == target_id).first()
        if persona: target_framework = persona.framework
    elif target_type == "person":
        person = db.query(models.Person).filter(models.Person.id == target_id).first()
        if person:
            if not person.custom_framework_id:
                person.custom_framework = models.PractiseFramework(name=f"{person.name} Custom", is_core=False)
                db.commit()
            target_framework = person.custom_framework
    elif target_type == "group":
        group = db.query(models.Group).filter(models.Group.id == target_id).first()
        if group:
            if not group.custom_framework_id:
                group.custom_framework = models.PractiseFramework(name=f"{group.name} Custom", is_core=False)
                db.commit()
            target_framework = group.custom_framework

    if not target_framework:
        raise HTTPException(status_code=404, detail="Target framework not found")

    # Check for duplicates in target
    existing = db.query(models.PractiseFrameworkItem).filter(
        models.PractiseFrameworkItem.framework_id == target_framework.id,
        models.PractiseFrameworkItem.aspect == item.aspect,
        models.PractiseFrameworkItem.value == item.value
    ).first()

    if existing:
        db.delete(item)
    else:
        item.framework_id = target_framework.id
    
    db.commit()
    return {"status": "success"}

@router.post("/frameworks/{framework_id}/items")
def create_framework_item(framework_id: int, item: schemas.PractiseFrameworkItemBase, db: Session = Depends(get_db)):
    new_item = models.PractiseFrameworkItem(
        framework_id=framework_id,
        aspect=item.aspect,
        value=item.value
    )
    db.add(new_item)
    db.commit()
    db.refresh(new_item)
    return new_item

@router.patch("/items/{item_id}")
def update_framework_item(item_id: int, item_update: schemas.PractiseFrameworkItemBase, db: Session = Depends(get_db)):
    item = db.query(models.PractiseFrameworkItem).filter(models.PractiseFrameworkItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    item.aspect = item_update.aspect
    item.value = item_update.value
    db.commit()
    db.refresh(item)
    return item

@router.delete("/items/{item_id}")
def delete_framework_item(item_id: int, db: Session = Depends(get_db)):
    item = db.query(models.PractiseFrameworkItem).filter(models.PractiseFrameworkItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    db.delete(item)
    db.commit()
    return {"status": "success"}
