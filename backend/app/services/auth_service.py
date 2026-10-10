import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import User, UserSession
from app.security import hash_password, verify_password


SESSION_LIFETIME = timedelta(hours=8)

# Used when an email does not exist, so login still performs
# a password verification rather than returning immediately.
DUMMY_PASSWORD_HASH = hash_password(secrets.token_urlsafe(32))


def hash_session_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def authenticate_user(
    db: Session,
    email: str,
    password: str,
) -> User | None:
    normalized_email = email.strip().lower()

    user = db.scalar(
        select(User).where(User.email == normalized_email)
    )

    stored_hash = (
        user.password_hash
        if user is not None
        else DUMMY_PASSWORD_HASH
    )

    password_matches = verify_password(password, stored_hash)

    if user is None or not password_matches or not user.is_active:
        return None

    return user


def create_session(db: Session, user: User) -> str:
    token = secrets.token_urlsafe(32)

    session = UserSession(
        user_id=user.id,
        token_hash=hash_session_token(token),
        expires_at=datetime.now(timezone.utc) + SESSION_LIFETIME,
    )

    db.add(session)
    db.flush()

    return token


def get_session_user(
    db: Session,
    token: str,
) -> User | None:
    statement = (
        select(User)
        .join(UserSession, UserSession.user_id == User.id)
        .where(
            UserSession.token_hash == hash_session_token(token),
            UserSession.expires_at > datetime.now(timezone.utc),
            User.is_active.is_(True),
        )
    )

    return db.scalar(statement)


def delete_session(db: Session, token: str) -> None:
    statement = delete(UserSession).where(
        UserSession.token_hash == hash_session_token(token)
    )

    db.execute(statement)