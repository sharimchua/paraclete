import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.main import app
from backend.database import Base, get_db

SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(scope="session")
def engine_fixture():
    return engine


@pytest.fixture(scope="function", autouse=True)
def db_session(engine_fixture):
    # Re-create tables
    Base.metadata.create_all(bind=engine_fixture)

    db = TestingSessionLocal()
    yield db
    db.close()

    # Drop tables after each test
    Base.metadata.drop_all(bind=engine_fixture)


@pytest.fixture(scope="function")
def client(db_session):
    return TestClient(app)
