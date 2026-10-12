import logging

from fastapi import HTTPException, Request
from sqlalchemy.exc import SQLAlchemyError

from app.auth_dependencies import DatabaseSession
from app.services.login_rate_limit_service import consume_login_attempt


logger = logging.getLogger(__name__)


def require_login_capacity(
    request: Request,
    db: DatabaseSession,
) -> None:
    if request.client is None:
        raise HTTPException(
            status_code=400,
            detail="Could not identify the requesting client.",
        )

    # Use the address supplied by the server.
    # Do not read arbitrary X-Forwarded-For headers here.
    client_address = request.client.host

    try:
        with db.begin():
            retry_after = consume_login_attempt(db, client_address)

        # The counter is committed before rejection or password checking.
        if retry_after:
            raise HTTPException(
                status_code=429,
                detail="Too many login attempts. Please try again later.",
                headers={"Retry-After": str(retry_after)},
            )

    except SQLAlchemyError:
        logger.exception("Could not update the login rate limit")
        raise HTTPException(
            status_code=503,
            detail="Login is temporarily unavailable.",
        ) from None