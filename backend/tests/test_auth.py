from datetime import datetime, timedelta, timezone
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import User, UserSession
from app.security import hash_password
from app.services.auth_service import hash_session_token


TRUSTED_ORIGIN = {"Origin": "http://localhost:5173"}
TEST_EMAIL = "operator@example.com"
TEST_PASSWORD = "Test password for authentication only"
DEMO_ORGANIZATION_ID = UUID("00000000-0000-0000-0000-000000000001")


@pytest.fixture()
def test_user(db_session: Session) -> UUID:
    with db_session.begin():
        user = User(
            email=TEST_EMAIL,
            password_hash=hash_password(TEST_PASSWORD),
            organization_id=DEMO_ORGANIZATION_ID,
            role="operator",
        )

        db_session.add(user)
        db_session.flush()
        user_id = user.id

    return user_id


def login(client: TestClient):
    return client.post(
        "/auth/login",
        json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD,
        },
        headers=TRUSTED_ORIGIN,
    )


def test_me_requires_login(client: TestClient) -> None:
    response = client.get("/auth/me")

    assert response.status_code == 401


def test_login_and_current_user(
    client: TestClient,
    test_user: UUID,
    db_session: Session,
) -> None:
    response = login(client)

    assert response.status_code == 200

    user_data = response.json()
    assert user_data["id"] == str(test_user)
    assert user_data["email"] == TEST_EMAIL
    assert user_data["role"] == "operator"
    assert user_data["organization_id"] == str(DEMO_ORGANIZATION_ID)
    assert "password_hash" not in user_data

    cookie_header = response.headers["set-cookie"].lower()
    assert "httponly" in cookie_header
    assert "samesite=lax" in cookie_header

    token = client.cookies.get("drone_session")
    assert token is not None

    current_user = client.get("/auth/me")

    assert current_user.status_code == 200
    assert current_user.json() == user_data

    stored_session = db_session.scalar(
        select(UserSession).where(UserSession.user_id == test_user)
    )

    assert stored_session is not None
    assert stored_session.token_hash == hash_session_token(token)
    assert stored_session.token_hash != token


@pytest.mark.parametrize(
    ("email", "password"),
    [
        (TEST_EMAIL, "Incorrect password"),
        ("unknown@example.com", TEST_PASSWORD),
    ],
)
def test_invalid_credentials_are_rejected(
    client: TestClient,
    test_user: UUID,
    email: str,
    password: str,
) -> None:
    response = client.post(
        "/auth/login",
        json={"email": email, "password": password},
        headers=TRUSTED_ORIGIN,
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password."
    assert client.cookies.get("drone_session") is None


def test_inactive_user_cannot_login(
    client: TestClient,
    test_user: UUID,
    db_session: Session,
) -> None:
    with db_session.begin():
        user = db_session.get(User, test_user)
        assert user is not None
        user.is_active = False

    assert login(client).status_code == 401


def test_invalid_session_is_rejected(client: TestClient) -> None:
    client.cookies.set("drone_session", "invalid-session-token")

    assert client.get("/auth/me").status_code == 401


def test_expired_session_is_rejected(
    client: TestClient,
    test_user: UUID,
    db_session: Session,
) -> None:
    token = "test-token-for-an-expired-session"

    with db_session.begin():
        db_session.add(
            UserSession(
                user_id=test_user,
                token_hash=hash_session_token(token),
                expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),
            )
        )

    client.cookies.set("drone_session", token)

    assert client.get("/auth/me").status_code == 401


def test_logout_invalidates_session(
    client: TestClient,
    test_user: UUID,
    db_session: Session,
) -> None:
    assert login(client).status_code == 200

    token = client.cookies.get("drone_session")
    assert token is not None

    response = client.post("/auth/logout", headers=TRUSTED_ORIGIN)

    assert response.status_code == 204
    assert client.cookies.get("drone_session") is None
    assert client.get("/auth/me").status_code == 401

    stored_session_id = db_session.scalar(
        select(UserSession.id).where(
            UserSession.token_hash == hash_session_token(token)
        )
    )

    assert stored_session_id is None

    # Reusing the old token must not restore access.
    client.cookies.set("drone_session", token)
    assert client.get("/auth/me").status_code == 401


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"Origin": "https://untrusted.example"},
    ],
)
def test_login_rejects_untrusted_origins(
    client: TestClient,
    headers: dict,
) -> None:
    response = client.post(
        "/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
        headers=headers,
    )

    assert response.status_code == 403


def test_logout_rejects_untrusted_origin(client: TestClient) -> None:
    response = client.post(
        "/auth/logout",
        headers={"Origin": "https://untrusted.example"},
    )

    assert response.status_code == 403