import asyncio
import time
import json
import numpy as np
import os
from sqlalchemy.orm import Session
from sqlalchemy import create_engine
from backend.database import Base
from backend import models
from sqlalchemy.orm import sessionmaker
from datetime import datetime

# Use a purely in-memory SQLite database for benchmark
engine = create_engine("sqlite:///:memory:", echo=False)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def setup_data():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    print("Inserting notes and embeddings...")
    for i in range(200):
        # Setting a random date for the required field
        note = models.Note(title=f"Note {i}", raw_capture=f"Content {i}", date=datetime.now().date())
        db.add(note)
        db.commit()
        db.refresh(note)

        # Add embedding
        vec = np.random.rand(100).tolist()
        ne = models.NoteEmbedding(note_id=note.id, vector=json.dumps(vec))
        db.add(ne)

    db.commit()
    db.close()

def run_original():
    db = SessionLocal()
    start = time.time()

    q_vec = np.random.rand(100)
    note_embeddings = db.query(models.NoteEmbedding).all()
    results = []

    queries_run = 1 # query embeddings

    for ne in note_embeddings:
        n_vec = np.array(json.loads(ne.vector))
        norm_q = np.linalg.norm(q_vec)
        norm_n = np.linalg.norm(n_vec)
        if norm_q > 0 and norm_n > 0:
            score = np.dot(q_vec, n_vec) / (norm_q * norm_n)
            if score > 0.3:
                # simulating DB query, we won't intercept sqlalchemy directly but we know it runs
                note = db.query(models.Note).filter(models.Note.id == ne.note_id).first()
                queries_run += 1
                if note:
                    results.append({
                        "note": note,
                        "score": float(score)
                    })

    results.sort(key=lambda x: x["score"], reverse=True)
    res = results[:10]

    end = time.time()
    db.close()
    return end - start, queries_run

def run_optimized():
    db = SessionLocal()
    start = time.time()

    q_vec = np.random.rand(100)
    note_embeddings = db.query(models.NoteEmbedding).all()

    queries_run = 1

    scored_notes = []
    for ne in note_embeddings:
        n_vec = np.array(json.loads(ne.vector))
        norm_q = np.linalg.norm(q_vec)
        norm_n = np.linalg.norm(n_vec)
        if norm_q > 0 and norm_n > 0:
            score = np.dot(q_vec, n_vec) / (norm_q * norm_n)
            if score > 0.3:
                scored_notes.append({"note_id": ne.note_id, "score": float(score)})

    results = []
    if scored_notes:
        note_ids = [sn["note_id"] for sn in scored_notes]
        notes = db.query(models.Note).filter(models.Note.id.in_(note_ids)).all()
        queries_run += 1
        note_map = {note.id: note for note in notes}

        for sn in scored_notes:
            if sn["note_id"] in note_map:
                results.append({
                    "note": note_map[sn["note_id"]],
                    "score": sn["score"]
                })

    results.sort(key=lambda x: x["score"], reverse=True)
    res = results[:10]

    end = time.time()
    db.close()
    return end - start, queries_run

setup_data()

# Run a few times to get average
orig_times, orig_qs = [], []
opt_times, opt_qs = [], []

for _ in range(10):
    t, q = run_original()
    orig_times.append(t)
    orig_qs.append(q)

    t, q = run_optimized()
    opt_times.append(t)
    opt_qs.append(q)

avg_orig_time = sum(orig_times) / len(orig_times)
avg_opt_time = sum(opt_times) / len(opt_times)

print(f"Original: {avg_orig_time:.4f}s, Queries: {orig_qs[0]}")
print(f"Optimized: {avg_opt_time:.4f}s, Queries: {opt_qs[0]}")
print(f"Performance Change: {((avg_orig_time - avg_opt_time) / avg_orig_time) * 100:.2f}% faster")
