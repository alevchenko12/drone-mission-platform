import hashlib
import hmac
import os
from datetime import timedelta
from math import ceil

from sqlalchemy import case, func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models import LoginRateLimit


MAX_LOGIN_ATTEMPTS = 20
LOGIN_WINDOW = timedelta(minutes=5)


def hash_client_address(address: str) -> str:
    secret = os.getenv("RATE_LIMIT_HASH_SECRET")

    if not secret or len(secret) < 32:
        raise RuntimeError(
            "RATE_LIMIT_HASH_SECRET must contain at least 32 characters."
        )

    return hmac.new(
        secret.encode("utf-8"),
        address.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def consume_login_attempt(
    db: Session,
    client_address: str,
) -> int:
    """
    Count one login attempt.

    Return 0 when allowed, or the number of seconds to wait when blocked.
    The caller must commit the transaction, including blocked attempts.
    """
    key_hash = hash_client_address(client_address)

    # Use PostgreSQL's clock consistently across backend workers.
    now = func.now()
    window_expired = LoginRateLimit.expires_at <= now

    statement = insert(LoginRateLimit).values(
        key_hash=key_hash,
        attempt_count=1,
        window_started_at=now,
        expires_at=now + LOGIN_WINDOW,
    )

    # Insert a new counter, or atomically update the existing one.
    statement = statement.on_conflict_do_update(
        index_elements=[LoginRateLimit.key_hash],
        set_={
            "attempt_count": case(
                (window_expired, 1),
                else_=func.least(
                    LoginRateLimit.attempt_count + 1,
                    MAX_LOGIN_ATTEMPTS + 1,
                ),
            ),
            "window_started_at": case(
                (window_expired, now),
                else_=LoginRateLimit.window_started_at,
            ),
            "expires_at": case(
                (window_expired, now + LOGIN_WINDOW),
                else_=LoginRateLimit.expires_at,
            ),
        },
    ).returning(
        LoginRateLimit.attempt_count,
        LoginRateLimit.expires_at,
        now.label("database_now"),
    )

    attempt_count, expires_at, database_now = db.execute(statement).one()

    if attempt_count <= MAX_LOGIN_ATTEMPTS:
        return 0

    return max(
        1,
        ceil((expires_at - database_now).total_seconds()),
    )