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

from uuid import UUID

from app.models import User
from app.security import hash_password


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
            
@pytest.fixture()
def admin_user(db_session: Session) -> UUID:
    with db_session.begin():
        user = User(
            email="mission-admin@example.com",
            password_hash=hash_password("Mission admin test password"),
            organization_id=UUID(
                "00000000-0000-0000-0000-000000000001"
            ),
            role="admin",
        )

        db_session.add(user)
        db_session.flush()
        user_id = user.id

    return user_id


@pytest.fixture()
def authenticated_client(
    client: TestClient,
    admin_user: UUID,
) -> TestClient:
    # Also supplies the trusted Origin for POST and DELETE requests.
    client.headers["Origin"] = "http://localhost:5173"

    response = client.post(
        "/auth/login",
        json={
            "email": "mission-admin@example.com",
            "password": "Mission admin test password",
        },
    )

    assert response.status_code == 200

    return client