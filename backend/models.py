from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, Table, Date, Boolean, Enum
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from .database import Base

# Junction table for Tags
# Phase 2 Step 2: Junction tables for strictly managed Tags
person_tags = Table('person_tags', Base.metadata,
    Column('person_id', Integer, ForeignKey('persons.id')),
    Column('tag_id', Integer, ForeignKey('tags.id'))
)

group_tags = Table('group_tags', Base.metadata,
    Column('group_id', Integer, ForeignKey('groups.id')),
    Column('tag_id', Integer, ForeignKey('tags.id'))
)

note_tags = Table('note_tags', Base.metadata,
    Column('note_id', Integer, ForeignKey('notes.id')),
    Column('tag_id', Integer, ForeignKey('tags.id'))
)

reference_tags = Table('reference_tags', Base.metadata,
    Column('reference_id', Integer, ForeignKey('references.id')),
    Column('tag_id', Integer, ForeignKey('tags.id'))
)

# Phase 2 Step 3: Core Entities Junction Tables
group_members = Table('group_members', Base.metadata,
    Column('group_id', Integer, ForeignKey('groups.id')),
    Column('person_id', Integer, ForeignKey('persons.id'))
)

note_references = Table('note_references', Base.metadata,
    Column('note_id', Integer, ForeignKey('notes.id')),
    Column('reference_id', Integer, ForeignKey('references.id'))
)

person_references = Table('person_references', Base.metadata,
    Column('person_id', Integer, ForeignKey('persons.id')),
    Column('reference_id', Integer, ForeignKey('references.id'))
)

class Tag(Base):
    __tablename__ = "tags"
    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, nullable=True) # e.g., "Instrument"
    value = Column(String, unique=True, index=True) # e.g., "Guitar"

    def __repr__(self):
        return f"<Tag(key={self.key}, value={self.value})>"

class Person(Base):
    __tablename__ = "persons"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    contact_method = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    tags = relationship("Tag", secondary=person_tags, backref="persons")
    groups = relationship("Group", secondary=group_members, back_populates="members")
    notes = relationship("Note", back_populates="person")
    references = relationship("Reference", secondary=person_references, back_populates="persons")

class Group(Base):
    __tablename__ = "groups"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    tags = relationship("Tag", secondary=group_tags, backref="groups")
    members = relationship("Person", secondary=group_members, back_populates="groups")
    notes = relationship("Note", back_populates="group")

class NoteStage(str, enum.Enum):
    PREPARE = "Prepare"
    CAPTURE = "Capture"
    CLEAN = "Clean"
    PUBLISHED = "Published"
    ARCHIVED = "Archived"

class Note(Base):
    __tablename__ = "notes"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    date = Column(Date, default=lambda: datetime.utcnow().date())
    stage = Column(Enum(NoteStage), default=NoteStage.PREPARE)
    raw_capture = Column(Text, nullable=True)
    cleaned_text = Column(Text, nullable=True)
    session_brief = Column(Text, nullable=True)
    person_id = Column(Integer, ForeignKey("persons.id"), nullable=True)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    person = relationship("Person", back_populates="notes")
    group = relationship("Group", back_populates="notes")
    tags = relationship("Tag", secondary=note_tags, backref="notes")
    actions = relationship("Action", back_populates="note", cascade="all, delete-orphan")
    messages = relationship("Message", back_populates="note", cascade="all, delete-orphan")
    references = relationship("Reference", secondary=note_references, back_populates="linked_notes")
    generated_references = relationship("Reference", back_populates="source_note", cascade="all, delete-orphan")
    embedding = relationship("NoteEmbedding", back_populates="note", cascade="all, delete-orphan", uselist=False)


class ReferenceType(str, enum.Enum):
    CONCEPT = "Concept"
    RESOURCE = "Resource"
    TECHNIQUE = "Technique"
    PATTERN = "Pattern"
    TEMPLATE = "Template"

class Reference(Base):
    __tablename__ = "references"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    type = Column(Enum(ReferenceType), default=ReferenceType.CONCEPT)
    body = Column(Text, nullable=True)
    source_note_id = Column(Integer, ForeignKey("notes.id", ondelete="SET NULL"), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    source_note = relationship("Note", back_populates="generated_references")
    tags = relationship("Tag", secondary=reference_tags, backref="references")
    linked_notes = relationship("Note", secondary=note_references, back_populates="references")
    persons = relationship("Person", secondary=person_references, back_populates="references")

class Action(Base):
    __tablename__ = "actions"
    id = Column(Integer, primary_key=True, index=True)
    text = Column(String)
    resolved = Column(Boolean, default=False)
    note_id = Column(Integer, ForeignKey("notes.id", ondelete="CASCADE"))


    # Relationships
    note = relationship("Note", back_populates="actions")

class Message(Base):
    __tablename__ = "messages"
    id = Column(Integer, primary_key=True, index=True)
    draft_text = Column(Text)
    sent_at = Column(DateTime, nullable=True)
    note_id = Column(Integer, ForeignKey("notes.id", ondelete="CASCADE"))


    # Relationships
    note = relationship("Note", back_populates="messages")

class NoteEmbedding(Base):
    __tablename__ = "note_embeddings"
    note_id = Column(Integer, ForeignKey("notes.id", ondelete="CASCADE"), primary_key=True)
    vector = Column(Text) # JSON string of float list
    
    note = relationship("Note", back_populates="embedding")


class ReferenceEmbedding(Base):
    __tablename__ = "reference_embeddings"
    reference_id = Column(Integer, ForeignKey("references.id"), primary_key=True)
    vector = Column(Text) # JSON string of float list
    
    reference = relationship("Reference", backref="embedding")
