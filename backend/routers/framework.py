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
    """Returns the number of un-analyzed artifacts for the given scope."""
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
            
        return json.loads(clean_json)
    except Exception as e:
        return {"conflicts": [], "error": str(e)}

@router.post("/analyze")
async def trigger_framework_analysis(
    person_id: Optional[int] = None,
    group_id: Optional[int] = None,
    persona_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """Triggers the background framework analysis for each un-analyzed entity."""
    from ..services.framework_analysis_job import run_item_analysis_task
    from sqlalchemy import or_

    # 1. Fetch un-analyzed entries
    note_query = db.query(models.Note.id).filter(or_(models.Note.analyzed_for_framework == False, models.Note.analyzed_for_framework == None))
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
             await run_item_analysis_task(local_db, item_type, item_id, interrupt_event=interrupt_event)
        finally:
            local_db.close()

    # 3. Queue jobs
    job_ids = []
    
    # Notes
    for (nid,) in note_query.all():
        jid = background_manager.add_job(f"Analyze Note {nid}", worker_wrapper, item_type="note", item_id=nid, interrupt_event=True)
        job_ids.append(jid)
    
    # Messages
    for (mid,) in msg_query.all():
        jid = background_manager.add_job(f"Analyze Message {mid}", worker_wrapper, item_type="message", item_id=mid, interrupt_event=True)
        job_ids.append(jid)
        
    # References
    for (rid,) in ref_query.all():
        jid = background_manager.add_job(f"Analyze Reference {rid}", worker_wrapper, item_type="reference", item_id=rid, interrupt_event=True)
        job_ids.append(jid)

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
    
    db.commit()
    db.refresh(db_framework)
    return stitch_framework(db_framework)

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
        # Handle case-insensitive status filtering to match DB Enum names
        s = status.upper()
        if s in models.FrameworkProposalStatus.__members__:
            query = query.filter(models.FrameworkProposal.status == models.FrameworkProposalStatus[s])
        else:
            query = query.filter(models.FrameworkProposal.status == status)
    query = query.order_by(models.FrameworkProposal.created_at.desc())
    proposals = query.all()
    
    # Hydrate on the fly
    for p in proposals:
        source_note = None
        if p.source_type == "Note":
            source_note = db.query(models.Note).filter(models.Note.id == p.source_id).first()
            if source_note:
                p.source_context = f"Note: {source_note.title}"
        elif p.source_type == "Message":
            msg = db.query(models.Message).filter(models.Message.id == p.source_id).first()
            if msg and msg.note:
                source_note = msg.note
                p.source_context = f"Message for: {source_note.title}"
            else:
                p.source_context = "Draft Message"
        elif p.source_type == "Reference":
            ref = db.query(models.Reference).filter(models.Reference.id == p.source_id).first()
            if ref:
                p.source_context = f"Reference: {ref.title}"
                source_note = ref.source_note
        elif p.source_type == "Synthesis":
            p.source_context = "AI Synthesis Job"
        
        if source_note:
            p.source_date = source_note.date.strftime("%Y-%m-%d") if source_note.date else "Unknown"
            if source_note.person:
                p.source_owner = f"Person: {source_note.person.name}"
            elif source_note.group:
                p.source_owner = f"Group: {source_note.group.name}"
            else:
                p.source_owner = "Generic"
            
    return proposals

class ProposalResolution(BaseModel):
    approved: bool
    override_persona_id: Optional[int] = None
    override_person_id: Optional[int] = None
    override_group_id: Optional[int] = None
    override_is_core: Optional[bool] = None

@router.post("/proposals/{proposal_id}/resolve")
def resolve_proposal(proposal_id: int, resolution: ProposalResolution, db: Session = Depends(get_db)):
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
        if effective_is_core:
            target_framework = db.query(models.PractiseFramework).filter(models.PractiseFramework.is_core == True).first()
        elif effective_person_id:
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
    return {"status": "success", "new_status": proposal.status}

@router.post("/proposals/reject-all")
def reject_all_pending_proposals(db: Session = Depends(get_db)):
    """Convenience method to clear the analysis queue."""
    db.query(models.FrameworkProposal).filter(models.FrameworkProposal.status == models.FrameworkProposalStatus.PENDING).update({models.FrameworkProposal.status: models.FrameworkProposalStatus.REJECTED})
    db.commit()
    return {"status": "success"}

@router.get("/custom")
def read_custom_frameworks(db: Session = Depends(get_db)):
    """Returns Persons and Groups that have custom frameworks."""
    persons = db.query(models.Person).filter(models.Person.custom_framework_id != None).all()
    groups = db.query(models.Group).filter(models.Group.custom_framework_id != None).all()
    
    result = []
    for p in persons:
        stitch_framework(p.custom_framework)
        result.append({"type": "person", "id": p.id, "name": p.name, "framework": p.custom_framework})
    for g in groups:
        stitch_framework(g.custom_framework)
        result.append({"type": "group", "id": g.id, "name": g.name, "framework": g.custom_framework})
    return result

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

    # We want a structured response, not just text
    # But resolve_framework_items returns text. Let's see if we can get items.
    # For now, we'll return the text but wrapped.
    from ..services.framework_resolver import resolve_framework_items
    text = resolve_framework_items(db, persona_id=persona_id, person_id=person_id, group_id=group_id)
    return {"consolidated_text": text}

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
        return {"status": "success", "count": len(new_proposals)}

    except HTTPException:
        raise
    except Exception as e:
        print(f"ERROR in synthesis: {e}")
        print(traceback.format_exc())
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
    try:
        draft = await llm.workflows.run_persona_draft(
            note_content=note.cleaned_text or note.raw_capture or "",
            persona_name=persona.name,
            persona_bio=augmented_bio,
            references=refs_text
        )
        return {
            "draft": draft,
            "persona_id": persona.id,
            "persona_name": persona.name,
            "is_inherited": (persona_id is None and effective_persona_id != (note.person.persona_id if note.person else None))
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
