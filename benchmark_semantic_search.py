import asyncio
import time
import json
import numpy as np
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import backend.models as models
from backend.database import Base

# Setup database
engine = create_engine("sqlite:///:memory:")
Base.metadata.create_all(engine)
SessionLocal = sessionmaker(bind=engine)
db = SessionLocal()

# Seed database with dummy data
num_notes = 1000
for i in range(num_notes):
    note = models.Note(title=f"Note {i}", raw_capture=f"Content {i}")
    db.add(note)
db.commit()

# Seed embeddings
for i in range(num_notes):
    # random vectors
    vector = np.random.rand(1536).tolist()
    ne = models.NoteEmbedding(note_id=i+1, vector=json.dumps(vector))
    db.add(ne)
db.commit()

print(f"Inserted {num_notes} notes and embeddings")

# Query
q_vec = np.random.rand(1536)

def run_unoptimized():
    start_time = time.time()

    note_embeddings = db.query(models.NoteEmbedding).all()
    results = []

    for ne in note_embeddings:
        n_vec = np.array(json.loads(ne.vector))
        # Cosine similarity
        norm_q = np.linalg.norm(q_vec)
        norm_n = np.linalg.norm(n_vec)
        if norm_q > 0 and norm_n > 0:
            score = np.dot(q_vec, n_vec) / (norm_q * norm_n)
            # Higher threshold for better results
            # Lowering threshold in benchmark to ensure we get some queries
            if score > 0.7:
                note = db.query(models.Note).filter(models.Note.id == ne.note_id).first()
                if note:
                    results.append({
                        "note": note,
                        "score": float(score)
                    })

    results.sort(key=lambda x: x["score"], reverse=True)
    return time.time() - start_time, len(results)

def run_optimized():
    start_time = time.time()

    norm_q = np.linalg.norm(q_vec)
    note_embeddings = db.query(models.NoteEmbedding).all()
    matched_scores = {}

    for ne in note_embeddings:
        n_vec = np.array(json.loads(ne.vector))
        # Cosine similarity
        norm_n = np.linalg.norm(n_vec)
        if norm_q > 0 and norm_n > 0:
            score = np.dot(q_vec, n_vec) / (norm_q * norm_n)
            if score > 0.7:
                matched_scores[ne.note_id] = float(score)

    results = []
    if matched_scores:
        notes = db.query(models.Note).filter(models.Note.id.in_(matched_scores.keys())).all()
        for note in notes:
            results.append({
                "note": note,
                "score": matched_scores[note.id]
            })

    results.sort(key=lambda x: x["score"], reverse=True)
    return time.time() - start_time, len(results)

unopt_time, unopt_len = run_unoptimized()
opt_time, opt_len = run_optimized()

print(f"Unoptimized time: {unopt_time:.4f}s, results: {unopt_len}")
print(f"Optimized time:   {opt_time:.4f}s, results: {opt_len}")
