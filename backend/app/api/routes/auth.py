import logging

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.exc import SQLAlchemyError

from app.api.schemas.auth_schema import (
    CurrentUserResponse,
    LoginRequest,
)
from app.auth_dependencies import (
    CurrentUser,
    DatabaseSession,
    SESSION_COOKIE_NAME,
    SESSION_COOKIE_SECURE,
    require_trusted_origin,
)
from app.services.auth_service import (
    SESSION_LIFETIME,
    authenticate_user,
    create_session,
    delete_session,
)


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["authentication"])


@router.post(
    "/login",
    response_model=CurrentUserResponse,
    dependencies=[Depends(require_trusted_origin)],
)
def login(
    payload: LoginRequest,
    response: Response,
    db: DatabaseSession,
) -> CurrentUserResponse:
    try:
        with db.begin():
            user = authenticate_user(
                db,
                str(payload.email),
                payload.password,
            )

            if user is None:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid email or password.",
                )

            token = create_session(db, user)
            user_response = CurrentUserResponse.model_validate(user)

    except SQLAlchemyError:
        logger.exception("Database error during login")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication storage is temporarily unavailable.",
        ) from None

    # Only issue the cookie after the transaction succeeds.
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=int(SESSION_LIFETIME.total_seconds()),
        httponly=True,
        secure=SESSION_COOKIE_SECURE,
        samesite="lax",
        path="/",
    )

    return user_response


@router.get("/me", response_model=CurrentUserResponse)
def current_user(user: CurrentUser) -> CurrentUserResponse:
    return CurrentUserResponse.model_validate(user)


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_trusted_origin)],
)
def logout(
    request: Request,
    db: DatabaseSession,
) -> Response:
    token = request.cookies.get(SESSION_COOKIE_NAME)

    try:
        if token:
            with db.begin():
                delete_session(db, token)

    except SQLAlchemyError:
        logger.exception("Database error during logout")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication storage is temporarily unavailable.",
        ) from None

    response = Response(status_code=status.HTTP_204_NO_CONTENT)

    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        path="/",
        secure=SESSION_COOKIE_SECURE,
        httponly=True,
        samesite="lax",
    )

    return response