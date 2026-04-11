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

    return {
        "notes": note_query.count(),
        "messages": msg_query.count(),
        "references": ref_query.count(),
        "total": note_query.count() + msg_query.count() + ref_query.count()
    }

async def run_item_analysis_task(
    db: Session,
    item_type: str,
    item_id: int,
    interrupt_event: threading.Event = None
):
    """
    Analyzes a SINGLE item in the background. 
    This is the discrete task called by the BackgroundTaskManager.
    """
    if item_type == "note":
        item = db.query(models.Note).options(
            joinedload(models.Note.person).joinedload(models.Person.persona),
            joinedload(models.Note.group).joinedload(models.Group.persona)
        ).filter(models.Note.id == item_id).first()
    elif item_type == "message":
        item = db.query(models.Message).options(
            joinedload(models.Message.note).joinedload(models.Note.person).joinedload(models.Person.persona)
        ).filter(models.Message.id == item_id).first()
    elif item_type == "reference":
        item = db.query(models.Reference).filter(models.Reference.id == item_id).first()
    else:
        return

    if not item or item.analyzed_for_framework:
        return

    # 1. Resolve Persona context
    target_persona = None
    content = ""
    
    if item_type == "note":
        content = f"Title: {item.title}\n{item.cleaned_text or item.raw_capture}"
        if item.person:
            if item.person.persona: target_persona = item.person.persona
            elif item.person.groups:
                for g in item.person.groups:
                    if g.persona: target_persona = g.persona; break
        if not target_persona and item.group:
            if item.group.persona: target_persona = item.group.persona
            
    elif item_type == "reference":
        content = f"Title: {item.title}\n{item.body}"
        if item.source_note:
            n = item.source_note
            if n.person:
                if n.person.persona: target_persona = n.person.persona
                elif n.person.groups:
                    for g in n.person.groups:
                        if g.persona: target_persona = g.persona; break
            if not target_persona and n.group:
                if n.group.persona: target_persona = n.group.persona

    elif item_type == "message":
        content = item.draft_text or ""
        if item.note:
            n = item.note
            if n.person:
                if n.person.persona: target_persona = n.person.persona
                elif n.person.groups:
                    for g in n.person.groups:
                        if g.persona: target_persona = g.persona; break
            if not target_persona and n.group:
                if n.group.persona: target_persona = n.group.persona

    if not content.strip():
        item.analyzed_for_framework = True
        db.commit()
        return

    target_persona_name = target_persona.name if target_persona else "Core"
    target_persona_id = target_persona.id if target_persona else None

    # 2. Build Context String (For Phase 1, we still use the old text columns if they exist, but will migrate later)
    # Actually, we already dropped them in models.py, so we should fetch items instead.
    current_framework_text = "None"
    framework_to_fetch = None
    if target_persona_id:
        persona = db.query(models.Persona).filter(models.Persona.id == target_persona_id).first()
        if persona:
            framework_to_fetch = persona.framework
    else:
        framework_to_fetch = db.query(models.PractiseFramework).filter(models.PractiseFramework.is_core == True).first()

    if framework_to_fetch:
        items = db.query(models.PractiseFrameworkItem).filter(models.PractiseFrameworkItem.framework_id == framework_to_fetch.id).all()
        if items:
            current_framework_text = "### Current Framework Directives:\n" + "\n".join([f"- [{i.aspect}]: {i.value}" for i in items])

    # 3. LLM Call
    prompt = llm.templates.analyze_framework(content, target_persona_name, context=current_framework_text)
    
    try:
        resp_text = await asyncio.to_thread(
            llm.llm_manager.call,
            prompt,
            system="You are an expert at identifying professional practice styles. Extract patterns into instructional directives."
        )
        
        clean_json = resp_text.strip()
        if "```json" in clean_json:
            clean_json = clean_json.split("```json")[1].split("```")[0].strip()
        elif "```" in clean_json:
            clean_json = clean_json.split("```")[1].split("```")[0].strip()
        
        data = json.loads(clean_json)
        if "proposals" in data:
            import difflib
            
            # Fetch ALL pending proposals and APPROVED items for this scope ONCE
            pending_db_proposals = db.query(models.FrameworkProposal).filter(
                models.FrameworkProposal.persona_id == target_persona_id,
                models.FrameworkProposal.status == models.FrameworkProposalStatus.PENDING
            ).all()
            
            # Fetch approved items for de-duplication as well
            approved_items = []
            if framework_to_fetch:
                approved_items = db.query(models.PractiseFrameworkItem).filter(
                    models.PractiseFrameworkItem.framework_id == framework_to_fetch.id
                ).all()
            
            # Track newly created proposals in this session for internal de-duplication
            session_proposals = []

            for p in data["proposals"]:
                aspect = p.get("aspect", "Principles")
                value = p.get("value", "").strip()
                if not value: continue
                
                # --- Dynamic Similarity Matching ---
                # Fetch threshold from settings, default to 0.8
                threshold_setting = db.query(models.Setting).filter(models.Setting.key == "framework_similarity_threshold").first()
                threshold = float(threshold_setting.value) if threshold_setting else 0.8
                
                existing_similar = None
                already_approved = False
                
                # 1. Check against APPROVED items first (highest priority de-dupe)
                for item in approved_items:
                    if item.aspect == aspect:
                        similarity = difflib.SequenceMatcher(None, value.lower(), item.value.lower()).ratio()
                        if similarity > threshold:
                            log_msg = f"[FRAMEWORK] matches APPROVED item ({similarity:.2f}) | Skipping proposal.\n  NEW: {value[:100]}...\n  DB:  {item.value[:100]}..."
                            print(log_msg)
                            from ..websockets_manager import ws_manager
                            await ws_manager.broadcast({
                                "event": "llm_match",
                                "data": log_msg
                            }, db=db)
                            already_approved = True
                            break
                
                if already_approved:
                    continue

                # 2. Check against existing PENDING DB proposals
                for candidate in pending_db_proposals:
                    if candidate.aspect == aspect:
                        similarity = difflib.SequenceMatcher(None, value.lower(), candidate.value.lower()).ratio()
                        
                        # Debug logging
                        if similarity > (threshold - 0.2): # Log close calls as well
                            is_match = similarity > threshold
                            match_str = "MATCH=True" if is_match else "MATCH=False"
                            log_msg = f"[FRAMEWORK] Similarity {similarity:.2f} | {match_str} (Target: {threshold})\n  NEW: {value[:100]}...\n  DB:  {candidate.value[:100]}..."
                            print(log_msg)
                            
                            from ..websockets_manager import ws_manager
                            await ws_manager.broadcast({
                                "event": "llm_match" if is_match else "llm_no_match",
                                "data": log_msg
                            }, db=db)
                            existing_similar = candidate
                            break
                
                # 3. Check against session proposals
                if not existing_similar:
                    for s_prop in session_proposals:
                        if s_prop.aspect == aspect:
                            similarity = difflib.SequenceMatcher(None, value.lower(), s_prop.value.lower()).ratio()
                            if similarity > threshold:
                                log_msg = f"[FRAMEWORK] Session Similarity {similarity:.2f} | MATCH=True"
                                print(log_msg)
                                
                                from ..websockets_manager import ws_manager
                                await ws_manager.broadcast({
                                    "event": "llm_match",
                                    "data": log_msg
                                }, db=db)
                                existing_similar = s_prop
                                break

                if existing_similar:
                    existing_similar.observation_count += 1
                else:
                    new_proposal = models.FrameworkProposal(
                        source_type=item_type.capitalize(),
                        source_id=item_id,
                        aspect=aspect,
                        action=p.get("action", "Add"),
                        value=value,
                        persona_id=target_persona_id,
                        is_core=(target_persona_id is None)
                    )
                    db.add(new_proposal)
                    session_proposals.append(new_proposal)
        
        item.analyzed_for_framework = True
        db.commit()
    except Exception as e:
        db.rollback()
        raise e
