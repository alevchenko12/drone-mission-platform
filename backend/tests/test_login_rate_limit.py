from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import LoginRateLimit


TRUSTED_ORIGIN = {"Origin": "http://localhost:5173"}

INVALID_LOGIN = {
    "email": "unknown@example.com",
    "password": "Wrong password for rate limit tests",
}


def test_login_is_blocked_after_twenty_attempts(
    client: TestClient,
    db_session: Session,
) -> None:
    for _ in range(20):
        response = client.post(
            "/auth/login",
            json=INVALID_LOGIN,
            headers=TRUSTED_ORIGIN,
        )

        # Invalid credentials, but still within the rate limit.
        assert response.status_code == 401

    blocked_response = client.post(
        "/auth/login",
        json=INVALID_LOGIN,
        headers=TRUSTED_ORIGIN,
    )

    assert blocked_response.status_code == 429
    assert int(blocked_response.headers["Retry-After"]) > 0

    counter = db_session.scalar(select(LoginRateLimit))

    assert counter is not None
    assert counter.attempt_count == 21


def test_login_counter_resets_after_window_expires(
    client: TestClient,
    db_session: Session,
) -> None:
    for _ in range(21):
        response = client.post(
            "/auth/login",
            json=INVALID_LOGIN,
            headers=TRUSTED_ORIGIN,
        )

    assert response.status_code == 429

    # Move the stored window into the past instead of waiting five minutes.
    with db_session.begin():
        counter = db_session.scalar(select(LoginRateLimit))
        assert counter is not None

        past = datetime.now(timezone.utc) - timedelta(minutes=10)
        counter.window_started_at = past
        counter.expires_at = past + timedelta(minutes=5)

    response = client.post(
        "/auth/login",
        json=INVALID_LOGIN,
        headers=TRUSTED_ORIGIN,
    )

    assert response.status_code == 401

    # Refresh because another request updated the counter.
    db_session.expire_all()
    counter = db_session.scalar(select(LoginRateLimit))

    assert counter is not None
    assert counter.attempt_count == 1