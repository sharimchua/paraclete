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
    persona: Optional["Persona"] = None
    persona_id: Optional[int] = None
    inherited_persona: Optional["Persona"] = None
    custom_framework_id: Optional[int] = None
    note_count: Optional[int] = 0
    message_count: Optional[int] = 0
    latest_note_date: Optional[dt_date] = None
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
    persona: Optional["Persona"] = None
    persona_id: Optional[int] = None
    custom_framework_id: Optional[int] = None
    aggregated_note_count: Optional[int] = 0
    aggregated_message_count: Optional[int] = 0
    earliest_note_date: Optional[dt_date] = None
    latest_note_date: Optional[dt_date] = None
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

class MessageStatus(str, Enum):
    DRAFT = "draft"
    SENT = "sent"
    ARCHIVED = "archived"

class MessageSource(str, Enum):
    NATIVE = "native"
    IMPORTED = "imported"

class MessageBase(BaseModel):
    draft_text: Optional[str] = None
    sent_text: Optional[str] = None
    status: MessageStatus = MessageStatus.DRAFT
    source: MessageSource = MessageSource.NATIVE
    date: Optional[str] = None # YYYY-MM-DD
    note_id: Optional[int] = None
    person_id: Optional[int] = None
    group_id: Optional[int] = None
    persona_id: Optional[int] = None
    is_inbound: bool = False

class MessageCreate(MessageBase):
    pass

class MessageUpdate(BaseModel):
    draft_text: Optional[str] = None
    sent_text: Optional[str] = None
    status: Optional[MessageStatus] = None
    is_inbound: Optional[bool] = None
    date: Optional[str] = None
    person_id: Optional[int] = None
    group_id: Optional[int] = None
    sent_at: Optional[datetime] = None

class NoteBadge(BaseModel):
    id: int
    title: str
    date: dt_date
    model_config = ConfigDict(from_attributes=True)

class Message(MessageBase):
    id: int
    sent_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    person: Optional["Person"] = None
    group: Optional["Group"] = None
    note: Optional[NoteBadge] = None
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
    person: Optional["Person"] = None
    group: Optional["Group"] = None
    analyzed_for_framework: Optional[bool] = False
    model_config = ConfigDict(from_attributes=True)

class ReferenceType(str, Enum):
    CONCEPT = "CONCEPT"
    RESOURCE = "RESOURCE"
    TECHNIQUE = "TECHNIQUE"
    PATTERN = "PATTERN"
    TEMPLATE = "TEMPLATE"

class ReferenceBase(BaseModel):
    title: str
    type: ReferenceType
    body: Optional[str] = None
    source_note_id: Optional[int] = None
    url: Optional[str] = None

class ReferenceCreate(ReferenceBase):
    pass

class Reference(ReferenceBase):
    id: int
    created_at: datetime
    tags: List[Tag] = []
    embedding_status: str = "pending"
    analyzed_for_framework: Optional[bool] = False
    model_config = ConfigDict(from_attributes=True)

# Phase 6 Schemas

class PractiseFrameworkItemBase(BaseModel):
    aspect: str
    value: str

class PractiseFrameworkItemCreate(PractiseFrameworkItemBase):
    pass

class PractiseFrameworkItem(PractiseFrameworkItemBase):
    id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class PractiseFrameworkBase(BaseModel):
    name: Optional[str] = None
    is_core: bool = False

class PractiseFrameworkCreate(PractiseFrameworkBase):
    tone_idioms: Optional[str] = None
    formatting_preferences: Optional[str] = None
    common_phrasing: Optional[str] = None
    principles_tenets: Optional[str] = None

class PractiseFramework(PractiseFrameworkBase):
    id: int
    items: List[PractiseFrameworkItem] = []
    # Legacy Virtual Fields (populated on fetch)
    tone_idioms: Optional[str] = None
    formatting_preferences: Optional[str] = None
    common_phrasing: Optional[str] = None
    principles_tenets: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)

class PersonaBase(BaseModel):
    name: str
    avatar_logo: Optional[str] = None
    description: Optional[str] = None
    framework_id: Optional[int] = None

class PersonaCreate(PersonaBase):
    pass

class Persona(PersonaBase):
    id: int
    framework: PractiseFramework
    model_config = ConfigDict(from_attributes=True)

class FrameworkProposalStatus(str, Enum):
    PENDING = "PENDING"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    SUPERSEDED = "SUPERSEDED"

class FrameworkProposalBase(BaseModel):
    source_type: str
    source_id: int
    aspect: str
    action: str
    value: str
    observation_count: Optional[int] = 1
    source_context: Optional[str] = None # Hydrated dynamically
    source_owner: Optional[str] = None # Hydrated dynamically
    source_date: Optional[str] = None # Hydrated dynamically
    persona_id: Optional[int] = None
    person_id: Optional[int] = None
    group_id: Optional[int] = None
    persona_name: Optional[str] = None
    person_name: Optional[str] = None
    group_name: Optional[str] = None
    is_core: bool = False
    status: FrameworkProposalStatus = FrameworkProposalStatus.PENDING

class FrameworkProposal(FrameworkProposalBase):
    id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class ReferenceProposalBase(BaseModel):
    title: str
    type: ReferenceType
    body: Optional[str] = None
    source_note_id: int
    status: FrameworkProposalStatus = FrameworkProposalStatus.PENDING

class ReferenceProposalCreate(ReferenceProposalBase):
    pass

class ReferenceProposal(ReferenceProposalBase):
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
    actions: List[Action] = []
    messages: List[Message] = []

# Phase 4 Dashboard Schemas
class DashboardStats(BaseModel):
    person_count: int
    note_count: int
    group_count: int
    reference_count: int
    message_count: int

class CalendarDay(BaseModel):
    date: dt_date
    count: int
    message_count: int = 0

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

class LeaderboardEntry(BaseModel):
    id: int
    name: str
    note_count: int

# Rebuild models for circular references
Person.model_rebuild()
Group.model_rebuild()
Message.model_rebuild()
Note.model_rebuild()
Persona.model_rebuild()
