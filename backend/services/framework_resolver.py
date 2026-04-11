from sqlalchemy.orm import Session
from .. import models
from typing import List, Optional

def resolve_framework_items(
    db: Session, 
    persona_id: Optional[int] = None, 
    person_id: Optional[int] = None, 
    group_id: Optional[int] = None,
    aspects: Optional[List[str]] = None
) -> str:
    """
    Resolves the compositional framework for a given scope.
    Hierarchy: core -> persona -> custom(group) -> custom(person)
    """
    resolved_items = []
    
    # Discovery of persona if not provided
    if not persona_id:
        if person_id:
            person = db.query(models.Person).filter(models.Person.id == person_id).first()
            if person:
                persona_id = person.persona_id
                # Inherit from group if person doesn't have one
                if not persona_id and person.groups:
                    for group in person.groups:
                        if group.persona_id:
                            persona_id = group.persona_id
                            break
        elif group_id:
            group = db.query(models.Group).filter(models.Group.id == group_id).first()
            if group:
                persona_id = group.persona_id
    
    # 1. Global Core
    core = db.query(models.PractiseFramework).filter(models.PractiseFramework.is_core == True).first()
    if core:
        resolved_items.extend(core.items)
    
    # 2. Persona
    if persona_id:
        persona = db.query(models.Persona).filter(models.Persona.id == persona_id).first()
        if persona and persona.framework:
            resolved_items.extend(persona.framework.items)
            
    # 3. Group Custom
    # If group_id is provided, use it. If not, and person_id is provided, inherit from all their groups.
    if group_id:
        group = db.query(models.Group).filter(models.Group.id == group_id).first()
        if group and group.custom_framework:
            resolved_items.extend(group.custom_framework.items)
    elif person_id:
        person = db.query(models.Person).filter(models.Person.id == person_id).first()
        if person:
            for group in person.groups:
                if group.custom_framework:
                    resolved_items.extend(group.custom_framework.items)
            
    # 4. Person Custom
    if person_id:
        person = db.query(models.Person).filter(models.Person.id == person_id).first()
        if person and person.custom_framework:
            resolved_items.extend(person.custom_framework.items)

    # Filter by aspect if requested
    if aspects:
        # Case insensitive check
        aspects_upper = [a.upper() for a in aspects]
        resolved_items = [i for i in resolved_items if i.aspect.upper() in aspects_upper]

    if not resolved_items:
        return "No specific framework constraints identified."

    # Format as a string for the LLM
    output = []
    by_aspect = {}
    for item in resolved_items:
        if item.aspect not in by_aspect:
            by_aspect[item.aspect] = []
        if item.value not in by_aspect[item.aspect]: # Basic dedupe
            by_aspect[item.aspect].append(item.value)
        
    for aspect, values in by_aspect.items():
        output.append(f"### {aspect.upper()}")
        for val in values:
            output.append(f"- {val}")
        output.append("")
        
    return "\n".join(output)
