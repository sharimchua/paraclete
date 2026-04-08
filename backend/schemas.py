from pydantic import BaseModel, ConfigDict
from datetime import datetime, date
from typing import List, Optional
from enum import Enum

class TagBase(BaseModel):
    key: Optional[str] = None
    value: str

class TagCreate(TagBase):
    pass

class Tag(TagBase):
    id: int
    model_config = ConfigDict(from_attributes=True)

class PersonBase(BaseModel):
    name: str
    contact_method: Optional[str] = None

class PersonCreate(PersonBase):
    pass

class Person(PersonBase):
    id: int
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)

class GroupBase(BaseModel):
    name: str
    description: Optional[str] = None

class GroupCreate(GroupBase):
    pass

class Group(GroupBase):
    id: int
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)

class NoteStage(str, Enum):
    PREPARE = "Prepare"
    CAPTURE = "Capture"
    CLEAN = "Clean"
    PUBLISHED = "Published"
    ARCHIVED = "Archived"

class NoteBase(BaseModel):
    title: str
    date: date
    stage: NoteStage
    raw_capture: Optional[str] = None
    cleaned_text: Optional[str] = None
    person_id: Optional[int] = None
    group_id: Optional[int] = None

class NoteCreate(NoteBase):
    pass

class Note(NoteBase):
    id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class ReferenceType(str, Enum):
    CONCEPT = "Concept"
    RESOURCE = "Resource"
    TECHNIQUE = "Technique"
    PATTERN = "Pattern"
    TEMPLATE = "Template"

class ReferenceBase(BaseModel):
    title: str
    type: ReferenceType
    body: Optional[str] = None
    source_note_id: Optional[int] = None

class ReferenceCreate(ReferenceBase):
    pass

class Reference(ReferenceBase):
    id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

# For Atomic JSON Import/Export (Phase 2 Step 4.2)
class FullExport(BaseModel):
    persons: List[Person]
    groups: List[Group]
    tags: List[Tag]
    notes: List[Note]
    references: List[Reference]
    # junction relationships should be included for a truly atomic export, 
    # but for simplicity we assume linkage via IDs in this schema
