import json
import asyncio
from sqlalchemy.orm import Session
from sqlalchemy import or_
import threading

try:
    from .. import models, schemas, llm
except ImportError:
    import models, schemas, llm

async def run_framework_analysis(db: Session, interrupt_event: threading.Event = None):
    """
    Analyzes un-processed (analyzed_for_framework=False) Message, Note, and Reference records.
    Generates FrameworkProposals based on stylings, tones, and principles found.
    """
    print("DEBUG: Starting framework analysis job...")
    
    # 1. Fetch un-analyzed entries
    un_analyzed_notes = db.query(models.Note).filter(
        or_(models.Note.analyzed_for_framework == False, models.Note.analyzed_for_framework == None)
    ).all()
    un_analyzed_refs = db.query(models.Reference).filter(
        or_(models.Reference.analyzed_for_framework == False, models.Reference.analyzed_for_framework == None)
    ).all()
    un_analyzed_msgs = db.query(models.Message).filter(
        or_(models.Message.analyzed_for_framework == False, models.Message.analyzed_for_framework == None)
    ).all()
    
    all_items = []
    for n in un_analyzed_notes: all_items.append(("note", n))
    for r in un_analyzed_refs: all_items.append(("reference", r))
    for m in un_analyzed_msgs: all_items.append(("message", m))
    
    if not all_items:
        print("DEBUG: No items require framework analysis.")
        return

    # Count for progress tracking if we had it
    total = len(all_items)
    
    for idx, (dtype, item) in enumerate(all_items):
        # Immediate yield check
        if interrupt_event and interrupt_event.is_set():
            print("DEBUG: Framework analysis job received interrupt signal. Yielding...")
            break
            
        content = ""
        persona_name = "Core"
        persona_id = None
        
        # Extract content and contextual persona
        if dtype == "note":
            content = f"Title: {item.title}\n{item.cleaned_text or item.raw_capture}"
            # Find associated persona
            if item.person and item.person.personas:
                persona_name = item.person.personas[0].name
                persona_id = item.person.personas[0].id
            elif item.group and item.group.personas:
                persona_name = item.group.personas[0].name
                persona_id = item.group.personas[0].id
        elif dtype == "reference":
            content = f"Title: {item.title}\n{item.body}"
        elif dtype == "message":
            content = item.draft_text
            if item.note and item.note.person and item.note.person.personas:
                persona_name = item.note.person.personas[0].name
                persona_id = item.note.person.personas[0].id

        if not content.strip():
            item.analyzed_for_framework = True
            db.commit()
            continue

        print(f"DEBUG: Analyzing {dtype} {item.id} for persona: {persona_name}")

        # Fetch current framework for context to enable incremental updates
        current_framework_text = "None"
        if persona_id:
            persona = db.query(models.Persona).filter(models.Persona.id == persona_id).first()
            if persona and persona.framework:
                fw = persona.framework
                current_framework_text = (
                    f"### Current Persona Framework ({persona_name}):\n"
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
        prompt = llm.templates.analyze_framework(content, persona_name, context=current_framework_text)
        
        try:
            # We use the LLM to extract potential stylistic improvements
            # The LLM manager handles its own lock internally
            resp_text = await llm.llm_manager.call(
                prompt, 
                system="You are an expert at identifying professional practice styles. Extract patterns into JSON proposals."
            )
            
            # Extract JSON from response (handling potential markdown fences)
            clean_json = resp_text.strip()
            if "```json" in clean_json:
                clean_json = clean_json.split("```json")[1].split("```")[0].strip()
            elif "```" in clean_json:
                clean_json = clean_json.split("```")[1].split("```")[0].strip()
            
            data = json.loads(clean_json)
            if "proposals" in data:
                for p in data["proposals"]:
                    proposal = models.FrameworkProposal(
                        source_type=dtype,
                        source_id=item.id,
                        aspect=p.get("aspect", "Principles"),
                        action=p.get("action", "Add"),
                        value=p.get("value", ""),
                        persona_id=persona_id,
                        is_core=(persona_id is None)
                    )
                    db.add(proposal)
                
                item.analyzed_for_framework = True
                db.commit()
                print(f"DEBUG: Successfully generated {len(data['proposals'])} proposals for {dtype} {item.id}")
        except Exception as e:
            print(f"DEBUG: Failed to analyze {dtype} {item.id}: {e}")
            db.rollback()
            # We don't mark as analyzed so it can be retried later
            
    print("DEBUG: Framework analysis job finished.")
