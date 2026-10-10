import os
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.services.auth_service import get_session_user


SESSION_COOKIE_NAME = "drone_session"

secure_setting = os.getenv("SESSION_COOKIE_SECURE", "false").lower()

if secure_setting not in {"true", "false"}:
    raise RuntimeError("SESSION_COOKIE_SECURE must be true or false.")

SESSION_COOKIE_SECURE = secure_setting == "true"

ALLOWED_ORIGINS = {
    origin.strip()
    for origin in os.getenv(
        "APP_ALLOWED_ORIGINS",
        (
            "http://localhost:5173,"
            "http://127.0.0.1:5173,"
            "http://localhost:3000,"
            "http://127.0.0.1:3000,"
            "http://localhost:8000,"
            "http://127.0.0.1:8000"
        ),
    ).split(",")
    if origin.strip()
}

DatabaseSession = Annotated[Session, Depends(get_db)]


def require_trusted_origin(request: Request) -> None:
    origin = request.headers.get("origin")

    if origin not in ALLOWED_ORIGINS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Request origin is not allowed.",
        )


def get_current_user(
    request: Request,
    db: DatabaseSession,
) -> User:
    token = request.cookies.get(SESSION_COOKIE_NAME)

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )

    try:
        user = get_session_user(db, token)
    except SQLAlchemyError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication storage is temporarily unavailable.",
        ) from None

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session is invalid or expired.",
        )

    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_mission_writer(user: CurrentUser) -> User:
    if user.role not in {"admin", "operator"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to save missions.",
        )

    return user


def require_admin(user: CurrentUser) -> User:
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator permission required.",
        )

    return user


MissionWriter = Annotated[User, Depends(require_mission_writer)]
OrganizationAdmin = Annotated[User, Depends(require_admin)]