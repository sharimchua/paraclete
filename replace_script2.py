import re

with open('backend/main.py', 'r') as f:
    content = f.read()

# Add comments explaining optimization.
# Look for read_persons
comment_persons = """
@app.get("/persons/", response_model=List[schemas.Person])
def read_persons(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    # ⚡ Bolt Optimization:
    # 💡 What: Replaced joinedload with selectinload for Person.groups
    # 🎯 Why: joinedload creates inefficient Cartesian products when joining collections.
    # 📊 Impact: Significantly reduces query execution time and memory bloat.
    persons = ("""
content = content.replace(
    '@app.get("/persons/", response_model=List[schemas.Person])\ndef read_persons(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):\n    persons = (',
    comment_persons
)

comment_group = """
@app.get("/groups/{group_id}", response_model=schemas.Group)
def read_group(group_id: int, db: Session = Depends(get_db)):
    # ⚡ Bolt Optimization:
    # 💡 What: Replaced joinedload with selectinload for Group.members and sub-collections Person.notes, Person.messages
    # 🎯 Why: Prevent catastrophic Cartesian product explosion on multiple one-to-many joins.
    # 📊 Impact: O(1) queries instead of O(N*M) result rows, massive memory/speed saving.
    db_group = ("""
content = content.replace(
    '@app.get("/groups/{group_id}", response_model=schemas.Group)\ndef read_group(group_id: int, db: Session = Depends(get_db)):\n    db_group = (',
    comment_group
)

comment_notes = """
@app.get("/notes/", response_model=List[schemas.Note])
def read_notes(
    person_id: int = None,
    group_id: int = None,
    search: str = None,
    skip: int = 0,
    limit: int = 1000,
    db: Session = Depends(get_db),
):
    # ⚡ Bolt Optimization:
    # 💡 What: Swapped joinedload for selectinload on Note.tags, Note.actions, Note.messages, and Person.groups
    # 🎯 Why: joinedload with limit/offset truncates collections or causes massive data duplication
    # 📊 Impact: Ensures correct pagination results and avoids N+1 queries.
    query = db.query(models.Note).options("""
content = content.replace(
    '@app.get("/notes/", response_model=List[schemas.Note])\ndef read_notes(\n    person_id: int = None,\n    group_id: int = None,\n    search: str = None,\n    skip: int = 0,\n    limit: int = 1000,\n    db: Session = Depends(get_db),\n):\n    query = db.query(models.Note).options(',
    comment_notes
)

with open('backend/main.py', 'w') as f:
    f.write(content)

with open('backend/routers/topics.py', 'r') as f:
    content = f.read()

comment_topics = """
@router.get("/", response_model=List[schemas.Topic])
def get_topics(person_id: Optional[int] = None, group_id: Optional[int] = None, state: Optional[str] = None, skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    # ⚡ Bolt Optimization:
    # 💡 What: Added selectinload eager loading for Topic.notes, Topic.messages, Topic.reflections
    # 🎯 Why: Prevents N+1 queries during Pydantic serialization/enrichment
    # 📊 Impact: Reduces query count from 1+3N to exactly 4 queries.
    query = db.query(models.Topic).options(selectinload(models.Topic.notes), selectinload(models.Topic.messages), selectinload(models.Topic.reflections))"""

content = content.replace(
    '@router.get("/", response_model=List[schemas.Topic])\ndef get_topics(person_id: Optional[int] = None, group_id: Optional[int] = None, state: Optional[str] = None, skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):\n    query = db.query(models.Topic).options(selectinload(models.Topic.notes), selectinload(models.Topic.messages), selectinload(models.Topic.reflections))',
    comment_topics
)

with open('backend/routers/topics.py', 'w') as f:
    f.write(content)
