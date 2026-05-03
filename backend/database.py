from sqlalchemy import create_engine, MetaData
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from pathlib import Path

# SQLITE constraints naming convention
naming_convention = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

# Calculate absolute path for the database file
BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "paraclete.db"
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DB_PATH}")

print(f">>> DATABASE CONNECTION: {DATABASE_URL}")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})

# Enable WAL mode for better concurrency in multi-process environments
from sqlalchemy import event


@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

metadata = MetaData(naming_convention=naming_convention)
Base = declarative_base(metadata=metadata)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
