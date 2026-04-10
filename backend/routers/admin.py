from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import Optional
from ..database import get_db
from .. import models

router = APIRouter(prefix="/admin", tags=["admin"])

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
        
        db.commit()
        return {"status": "success", "reset_count": count}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
