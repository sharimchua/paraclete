from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from ..database import get_db
from .. import models, schemas

router = APIRouter(prefix="/reflections", tags=["reflections"])

@router.post("/", response_model=schemas.Reflection)
def create_reflection(reflection: schemas.ReflectionCreate, db: Session = Depends(get_db)):
    db_reflection = models.Reflection(**reflection.model_dump())
    db.add(db_reflection)
    db.commit()
    db.refresh(db_reflection)
    return db_reflection

@router.get("/", response_model=List[schemas.Reflection])
def get_reflections(person_id: int = None, group_id: int = None, skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    query = db.query(models.Reflection)
    if person_id:
        query = query.filter(models.Reflection.person_id == person_id)
    if group_id:
        query = query.filter(models.Reflection.group_id == group_id)
    return query.order_by(models.Reflection.created_at.desc()).offset(skip).limit(limit).all()

@router.patch("/{reflection_id}", response_model=schemas.Reflection)
def update_reflection(reflection_id: int, reflection: schemas.ReflectionUpdate, db: Session = Depends(get_db)):
    db_reflection = db.query(models.Reflection).filter(models.Reflection.id == reflection_id).first()
    if not db_reflection:
        raise HTTPException(status_code=404, detail="Reflection not found")

    update_data = reflection.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_reflection, key, value)

    db.commit()
    db.refresh(db_reflection)
    return db_reflection

@router.delete("/{reflection_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_reflection(reflection_id: int, db: Session = Depends(get_db)):
    db_reflection = db.query(models.Reflection).filter(models.Reflection.id == reflection_id).first()
    if not db_reflection:
        raise HTTPException(status_code=404, detail="Reflection not found")

    db.delete(db_reflection)
    db.commit()
    return None
