import os
from collections.abc import Generator

# Select the test database before importing application modules.
os.environ["POSTGRES_DB"] = "drone_platform_test"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session

from app.database import engine, get_db
from app.main import app


@pytest.fixture()
def db_connection() -> Generator[Connection, None, None]:
    if engine.url.database != "drone_platform_test":
        raise RuntimeError("Tests must use drone_platform_test.")

    with engine.connect() as connection:
        transaction = connection.begin()

        try:
            yield connection
        finally:
            transaction.rollback()


@pytest.fixture()
def db_session(
    db_connection: Connection,
) -> Generator[Session, None, None]:
    # Separate session for direct database assertions.
    with Session(
        bind=db_connection,
        join_transaction_mode="create_savepoint",
    ) as session:
        yield session


@pytest.fixture()
def client(
    db_connection: Connection,
) -> Generator[TestClient, None, None]:
    def override_get_db() -> Generator[Session, None, None]:
        # Each HTTP request gets its own session, just like the real app.
        with Session(
            bind=db_connection,
            join_transaction_mode="create_savepoint",
        ) as session:
            yield session

    previous_override = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = override_get_db

    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        if previous_override is None:
            app.dependency_overrides.pop(get_db, None)
        else:
            app.dependency_overrides[get_db] = previous_override