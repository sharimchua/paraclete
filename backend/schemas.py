from pydantic import BaseModel, ConfigDict
from datetime import datetime, date as dt_date
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

class TagLink(BaseModel):
    entity_type: str
    entity_id: int
    tag_id: int

class PersonBase(BaseModel):
    name: str
    contact_method: Optional[str] = None

class PersonCreate(PersonBase):
    pass

class PersonUpdate(BaseModel):
    name: Optional[str] = None
    contact_method: Optional[str] = None

class GroupBase(BaseModel):
    name: str
    description: Optional[str] = None

class GroupBadge(BaseModel):
    id: int
    name: str
    model_config = ConfigDict(from_attributes=True)

class PersonBadge(BaseModel):
    id: int
    name: str
    model_config = ConfigDict(from_attributes=True)

class Person(PersonBase):
    id: int
    created_at: datetime
    updated_at: datetime
    tags: List[Tag] = []
    groups: List[GroupBadge] = []
    model_config = ConfigDict(from_attributes=True)

class GroupCreate(GroupBase):
    pass

class GroupUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

class Group(GroupBase):
    id: int
    created_at: datetime
    updated_at: datetime
    tags: List[Tag] = []
    members: List[Person] = []
    model_config = ConfigDict(from_attributes=True)

class NoteStage(str, Enum):
    PREPARE = "Prepare"
    CAPTURE = "Capture"
    CLEAN = "Clean"
    PUBLISHED = "Published"
    ARCHIVED = "Archived"

class ActionBase(BaseModel):
    text: str
    resolved: bool = False

class ActionCreate(ActionBase):
    note_id: int

class Action(ActionBase):
    id: int
    note_id: int
    model_config = ConfigDict(from_attributes=True)

class MessageBase(BaseModel):
    draft_text: str
    sent_at: Optional[datetime] = None

class MessageCreate(MessageBase):
    note_id: int

class Message(MessageBase):
    id: int
    note_id: int
    model_config = ConfigDict(from_attributes=True)

class NoteBase(BaseModel):
    title: str
    date: dt_date
    stage: NoteStage
    raw_capture: Optional[str] = None
    cleaned_text: Optional[str] = None
    session_brief: Optional[str] = None
    person_id: Optional[int] = None
    group_id: Optional[int] = None

class NoteCreate(NoteBase):
    pass

class NoteUpdate(BaseModel):
    title: Optional[str] = None
    stage: Optional[NoteStage] = None
    raw_capture: Optional[str] = None
    cleaned_text: Optional[str] = None
    session_brief: Optional[str] = None
    date: Optional[dt_date] = None

class Note(NoteBase):
    id: int
    created_at: datetime
    tags: List[Tag] = []
    actions: List[Action] = []
    messages: List[Message] = []
    person: Optional[PersonBadge] = None
    group: Optional[GroupBadge] = None
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
    tags: List[Tag] = []
    model_config = ConfigDict(from_attributes=True)

# For Atomic JSON Import/Export (Phase 2 Step 4.2)
class FullExport(BaseModel):
    persons: List[Person]
    groups: List[Group]
    tags: List[Tag]
    notes: List[Note]
    references: List[Reference]
    actions: List[Action] = []
    messages: List[Message] = []

# Phase 4 Dashboard Schemas
class DashboardStats(BaseModel):
    person_count: int
    note_count: int
    group_count: int
    reference_count: int

class CalendarDay(BaseModel):
    date: dt_date
    count: int

class TrendStack(BaseModel):
    name: str
    count: int

class TrendPoint(BaseModel):
    label: str
    count: int
    stacks: List[TrendStack] = []

class ReferenceUsage(BaseModel):
    id: int
    title: str
    usage_count: int
