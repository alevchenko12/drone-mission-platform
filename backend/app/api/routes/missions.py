import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.exc import SQLAlchemyError

from app.api.schemas.mission_schema import (
    MissionCreate,
    MissionDetail,
    MissionSummary,
)
from app.auth_dependencies import (
    CurrentUser,
    DatabaseSession,
    MissionWriter,
    OrganizationAdmin,
    require_trusted_origin,
)
from app.services import mission_service


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/missions", tags=["missions"])


def database_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Mission storage is temporarily unavailable.",
    )


@router.post(
    "",
    response_model=MissionDetail,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_trusted_origin)],
)
def create_mission(
    payload: MissionCreate,
    user: MissionWriter,
    db: DatabaseSession,
) -> MissionDetail:
    try:
        mission = mission_service.save_mission(
            db,
            payload,
            user.organization_id,
        )

        return MissionDetail.model_validate(mission)

    except SQLAlchemyError:
        logger.exception("Database error while saving a mission")
        raise database_error() from None

    except RuntimeError:
        logger.exception("Could not retrieve the saved mission")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not retrieve the saved mission.",
        ) from None


@router.get("", response_model=list[MissionSummary])
def list_missions(
    user: CurrentUser,
    db: DatabaseSession,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[MissionSummary]:
    try:
        missions = mission_service.list_missions(
            db,
            user.organization_id,
            limit,
            offset,
        )

        return [
            MissionSummary.model_validate(mission)
            for mission in missions
        ]

    except SQLAlchemyError:
        logger.exception("Database error while listing missions")
        raise database_error() from None


@router.get("/{mission_id}", response_model=MissionDetail)
def get_mission(
    mission_id: UUID,
    user: CurrentUser,
    db: DatabaseSession,
) -> MissionDetail:
    try:
        mission = mission_service.get_mission(
            db,
            mission_id,
            user.organization_id,
        )

        if mission is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Mission not found.",
            )

        return MissionDetail.model_validate(mission)

    except SQLAlchemyError:
        logger.exception("Database error while retrieving a mission")
        raise database_error() from None


@router.delete(
    "/{mission_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_trusted_origin)],
)
def delete_mission(
    mission_id: UUID,
    user: OrganizationAdmin,
    db: DatabaseSession,
) -> Response:
    try:
        deleted = mission_service.delete_mission(
            db,
            mission_id,
            user.organization_id,
        )

        if not deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Mission not found.",
            )

        return Response(status_code=status.HTTP_204_NO_CONTENT)

    except SQLAlchemyError:
        logger.exception("Database error while deleting a mission")
        raise database_error() from None