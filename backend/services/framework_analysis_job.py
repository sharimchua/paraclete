import json
import asyncio
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_
import threading
from typing import Optional, List, Dict, Any

try:
    from .. import models, schemas, llm
except ImportError:
    import models, schemas, llm

async def get_pending_analysis_count(
    db: Session,
    person_id: Optional[int] = None,
    group_id: Optional[int] = None,
    persona_id: Optional[int] = None
) -> Dict[str, int]:
    """Returns counts of un-analyzed items within the given scope."""
    
    note_query = db.query(models.Note).filter(
        or_(models.Note.analyzed_for_framework == False, models.Note.analyzed_for_framework == None)
    )
    msg_query = db.query(models.Message).filter(
        or_(models.Message.analyzed_for_framework == False, models.Message.analyzed_for_framework == None)
    )
    ref_query = db.query(models.Reference).filter(
        or_(models.Reference.analyzed_for_framework == False, models.Reference.analyzed_for_framework == None)
    )

    if person_id:
        note_query = note_query.filter(models.Note.person_id == person_id)
        msg_query = msg_query.join(models.Note).filter(models.Note.person_id == person_id)
        ref_query = ref_query.filter(models.Reference.persons.any(models.Person.id == person_id))
    elif group_id:
        # Notes for group directly OR for persons in that group
        group_filter = or_(
            models.Note.group_id == group_id,
            models.Note.person.has(models.Person.groups.any(models.Group.id == group_id))
        )
        note_query = note_query.filter(group_filter)
        msg_query = msg_query.join(models.Note).filter(group_filter)
        
        # References associated with those notes OR directly with those persons
        ref_query = ref_query.filter(
            or_(
                models.Reference.linked_notes.any(group_filter),
                models.Reference.persons.any(models.Person.groups.any(models.Group.id == group_id))
            )
        )
    elif persona_id:
        # Notes for people or groups linked to this persona
        note_query = note_query.filter(
            or_(
                models.Note.person.has(models.Person.persona_id == persona_id),
                models.Note.group.has(models.Group.persona_id == persona_id)
            )
        )
        msg_query = msg_query.join(models.Note).filter(
            or_(
                models.Note.person.has(models.Person.persona_id == persona_id),
                models.Note.group.has(models.Group.persona_id == persona_id)
            )
        )
        # References associated with those notes
        ref_query = ref_query.filter(
            models.Reference.linked_notes.any(
                or_(
                    models.Note.person.has(models.Person.persona_id == persona_id),
                    models.Note.group.has(models.Group.persona_id == persona_id)
                )
            )
        )

    return {
        "notes": note_query.count(),
        "messages": msg_query.count(),
        "references": ref_query.count(),
        "total": note_query.count() + msg_query.count() + ref_query.count()
    }

async def run_framework_analysis(
    db: Session, 
    interrupt_event: threading.Event = None,
    person_id: Optional[int] = None,
    group_id: Optional[int] = None,
    persona_id: Optional[int] = None
):
    """
    Analyzes un-processed (analyzed_for_framework=False) Message, Note, and Reference records.
    Supports scoping by Person, Group, or Persona.
    """
    print(f"DEBUG: Starting framework analysis job (Scope: P={person_id}, G={group_id}, PR={persona_id})...")
    
    # 1. Fetch un-analyzed entries
    note_query = db.query(models.Note).options(
        joinedload(models.Note.person).joinedload(models.Person.persona),
        joinedload(models.Note.group).joinedload(models.Group.persona)
    ).filter(
        or_(models.Note.analyzed_for_framework == False, models.Note.analyzed_for_framework == None)
    )
    
    msg_query = db.query(models.Message).options(
        joinedload(models.Message.note).joinedload(models.Note.person).joinedload(models.Person.persona)
    ).filter(
        or_(models.Message.analyzed_for_framework == False, models.Message.analyzed_for_framework == None)
    )
    
    ref_query = db.query(models.Reference).filter(
        or_(models.Reference.analyzed_for_framework == False, models.Reference.analyzed_for_framework == None)
    )

    if person_id:
        note_query = note_query.filter(models.Note.person_id == person_id)
        msg_query = msg_query.join(models.Note).filter(models.Note.person_id == person_id)
        ref_query = ref_query.filter(models.Reference.persons.any(models.Person.id == person_id))
    elif group_id:
        # Broadband group filtering: Group notes + all notes of members
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
            or_(
                models.Note.person.has(models.Person.persona_id == persona_id),
                models.Note.group.has(models.Group.persona_id == persona_id)
            )
        )
        msg_query = msg_query.join(models.Note).filter(
            or_(
                models.Note.person.has(models.Person.persona_id == persona_id),
                models.Note.group.has(models.Group.persona_id == persona_id)
            )
        )
        ref_query = ref_query.filter(
            models.Reference.linked_notes.any(
                or_(
                    models.Note.person.has(models.Person.persona_id == persona_id),
                    models.Note.group.has(models.Group.persona_id == persona_id)
                )
            )
        )

    all_items = []
    for n in note_query.all(): all_items.append(("note", n))
    for r in ref_query.all(): all_items.append(("reference", r))
    for m in msg_query.all(): all_items.append(("message", m))
    
    if not all_items:
        print("DEBUG: No items require framework analysis for this scope.")
        return

    for idx, (dtype, item) in enumerate(all_items):
        if interrupt_event and interrupt_event.is_set():
            print("DEBUG: Framework analysis job received interrupt signal. Yielding...")
            break
            
        content = ""
        target_persona_name = "Core"
        target_persona_id = None
        
        # Robust hierarchical persona resolution
        target_persona = None
        
        if dtype == "note":
            content = f"Title: {item.title}\n{item.cleaned_text or item.raw_capture}"
            # Prioritize Person -> Inherited Group -> Direct Group
            if item.person:
                if item.person.persona:
                    target_persona = item.person.persona
                elif item.person.groups:
                    for g in item.person.groups:
                        if g.persona:
                            target_persona = g.persona
                            break
            if not target_persona and item.group:
                if item.group.persona:
                    target_persona = item.group.persona
                    
        elif dtype == "reference":
            content = f"Title: {item.title}\n{item.body}"
            if item.source_note:
                n = item.source_note
                if n.person:
                    if n.person.persona: target_persona = n.person.persona
                    elif n.person.groups:
                        for g in n.person.groups:
                            if g.persona:
                                target_persona = g.persona
                                break
                if not target_persona and n.group:
                    if n.group.persona: target_persona = n.group.persona

        elif dtype == "message":
            content = item.draft_text
            if item.note:
                n = item.note
                if n.person:
                    if n.person.persona: target_persona = n.person.persona
                    elif n.person.groups:
                        for g in n.person.groups:
                            if g.persona:
                                target_persona = g.persona
                                break
                if not target_persona and n.group:
                    if n.group.persona: target_persona = n.group.persona

        target_persona_name = target_persona.name if target_persona else "Core"
        target_persona_id = target_persona.id if target_persona else None

        if not content.strip():
            item.analyzed_for_framework = True
            if idx % 10 == 0: db.commit() # Periodic commit
            continue

        print(f"DEBUG: Analyzing {dtype} {item.id} for persona: {target_persona_name}")

        # Fetch current framework for context
        current_framework_text = "None"
        if target_persona_id:
            persona = db.query(models.Persona).filter(models.Persona.id == target_persona_id).first()
            if persona and persona.framework:
                fw = persona.framework
                current_framework_text = (
                    f"### Current Persona Framework ({target_persona_name}):\n"
                    f"- Tone/Idioms: {fw.tone_idioms or 'Not set'}\n"
                    f"- Formatting: {fw.formatting_preferences or 'Not set'}\n"
                    f"- Principles: {fw.principles_tenets or 'Not set'}"
                )
        else:
            core = db.query(models.PractiseFramework).filter(models.PractiseFramework.is_core == True).first()
            if core:
                current_framework_text = (
                    f"### Current Global Core Framework:\n"
                    f"- Tone/Idioms: {core.tone_idioms or 'Not set'}\n"
                    f"- Formatting: {core.formatting_preferences or 'Not set'}\n"
                    f"- Principles: {core.principles_tenets or 'Not set'}"
                )

        # Analysis prompt
        prompt = llm.templates.analyze_framework(content, target_persona_name, context=current_framework_text)
        
        try:
            # llm_manager.call is synchronous (using threading.Lock), so we must offload to a thread
            resp_text = await asyncio.to_thread(
                llm.llm_manager.call,
                prompt, 
                system="You are an expert at identifying professional practice styles. Extract patterns into JSON proposals."
            )
            
            clean_json = resp_text.strip()
            if "```json" in clean_json:
                clean_json = clean_json.split("```json")[1].split("```")[0].strip()
            elif "```" in clean_json:
                clean_json = clean_json.split("```")[1].split("```")[0].strip()
            
            data = json.loads(clean_json)
            if "proposals" in data:
                for p in data["proposals"]:
                    proposal = models.FrameworkProposal(
                        source_type=dtype.capitalize(),
                        source_id=item.id,
                        aspect=p.get("aspect", "Principles"),
                        action=p.get("action", "Add"),
                        value=p.get("value", ""),
                        persona_id=target_persona_id,
                        is_core=(target_persona_id is None)
                    )
                    db.add(proposal)
                
                item.analyzed_for_framework = True
                db.commit()
                print(f"DEBUG: Successfully generated {len(data['proposals'])} proposals for {dtype} {item.id}")
            else:
                # Still mark as analyzed even if no proposals found to clear the backlog
                item.analyzed_for_framework = True
                db.commit()
        except Exception as e:
            print(f"DEBUG: Failed to analyze {dtype} {item.id}: {e}")
            import traceback
            traceback.print_exc()
            db.rollback()
            
    print("DEBUG: Framework analysis job finished.")
