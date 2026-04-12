from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import Optional, List, Dict
try:
    from ..database import get_db
    from .. import models, schemas
except ImportError:
    from database import get_db
    import models, schemas

router = APIRouter(prefix="/admin", tags=["admin"])

@router.get("/settings")
async def get_settings(db: Session = Depends(get_db)):
    settings = db.query(models.Setting).all()
    return {s.key: s.value for s in settings}

@router.post("/settings/{key}")
async def update_setting(key: str, value: str, db: Session = Depends(get_db)):
    setting = db.query(models.Setting).filter(models.Setting.key == key).first()
    if not setting:
        setting = models.Setting(key=key, value=value)
        db.add(setting)
    else:
        setting.value = value
    db.commit()
    return {"status": "success", "key": key, "value": value}

@router.post("/reset-framework-analysis")
async def reset_framework_analysis(
    person_id: Optional[int] = None,
    group_id: Optional[int] = None,
    persona_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """
    Resets analyzed_for_framework flag to False for targeted scopes.
    This allows re-triggering analysis on existing items.
    """
    try:
        # Build queries for each type
        note_query = db.query(models.Note)
        msg_query = db.query(models.Message)
        ref_query = db.query(models.Reference)

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

        # Execute updates
        count = 0
        count += note_query.update({models.Note.analyzed_for_framework: False}, synchronize_session=False)
        count += msg_query.update({models.Message.analyzed_for_framework: False}, synchronize_session=False)
        count += ref_query.update({models.Reference.analyzed_for_framework: False}, synchronize_session=False)
        
        # Clear proposals as requested
        # For now, we clear ALL pending proposals during this reset
        db.query(models.FrameworkProposal).filter(models.FrameworkProposal.status == models.FrameworkProposalStatus.PENDING).delete(synchronize_session=False)
        
        db.commit()
        return {"status": "success", "reset_count": count}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/wipe-framework")
async def wipe_framework_data(db: Session = Depends(get_db)):
    """
    DANGEROUS: Deletes ALL PractiseFrameworkItem rows and ALL FrameworkProposal rows.
    Essentially resets the practice intelligence to zero.
    """
    try:
        # 1. Delete all items
        item_count = db.query(models.PractiseFrameworkItem).delete(synchronize_session=False)
        
        # 2. Delete all proposals
        prop_count = db.query(models.FrameworkProposal).delete(synchronize_session=False)

        # 3. Find and delete custom framework containers (not core, not persona)
        # We nullify links first to avoid foreign key issues
        db.query(models.Person).update({models.Person.custom_framework_id: None}, synchronize_session=False)
        db.query(models.Group).update({models.Group.custom_framework_id: None}, synchronize_session=False)
        
        # Now delete all frameworks that are NOT core and NOT used by a persona
        persona_fw_ids = [p.framework_id for p in db.query(models.Persona).all() if p.framework_id]
        fw_to_delete = db.query(models.PractiseFramework).filter(
            models.PractiseFramework.is_core == False,
            ~models.PractiseFramework.id.in_(persona_fw_ids)
        ).delete(synchronize_session=False)
        
        db.commit()
        return {
            "status": "success", 
            "deleted_items": item_count, 
            "deleted_proposals": prop_count,
            "deleted_containers": fw_to_delete
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/jobs")
async def list_background_jobs():
    from ..services.background_task_manager import background_manager
    return background_manager.list_jobs()

@router.post("/jobs/clear")
async def clear_completed_jobs():
    from ..services.background_task_manager import background_manager
    await background_manager.clear_completed_jobs()
    return {"status": "success"}
