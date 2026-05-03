import asyncio
from backend.database import SessionLocal, engine
from backend import models
from sqlalchemy.orm import selectinload

models.Base.metadata.create_all(bind=engine)
db = SessionLocal()

# Create dummy data
ref1 = models.Reference(title="Test1")
ref1.tags.append(models.Tag(key="A", value="B"))
ref1.embedding = models.ReferenceEmbedding(vector="[]")
db.add(ref1)
db.commit()

# Test the query
import time

start = time.time()
refs = db.query(models.Reference).all()
print(f"Without selectinload: {time.time() - start}")
for r in refs:
    pass

start = time.time()
refs = db.query(models.Reference).options(selectinload(models.Reference.tags), selectinload(models.Reference.embedding)).all()
print(f"With selectinload: {time.time() - start}")
