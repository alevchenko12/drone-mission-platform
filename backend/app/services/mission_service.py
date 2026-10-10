from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.schemas.mission_schema import MissionCreate
from app.models import Mission, Route


def save_mission(
    db: Session,
    payload: MissionCreate,
    organization_id: UUID,
) -> Mission:
    mission = Mission(
        organization_id=organization_id,
        name=payload.name,
        planning_inputs=payload.planning_inputs.model_dump(mode="json"),
        routes=[
            Route(
                drone_index=assignment.drone_index,
                goal_index=assignment.goal_index,
                route_coordinates=[
                    list(point) for point in assignment.route_coordinates
                ],
                distance=assignment.distance,
            )
            for assignment in payload.assignments
        ],
    )

    try:
        db.add(mission)
        db.flush()
        db.refresh(mission, attribute_names=["created_at"])
        result_id = mission.id
        db.commit()
    except Exception:
        db.rollback()
        raise

    saved_mission = get_mission(db, result_id, organization_id)

    if saved_mission is None:
        raise RuntimeError("Saved mission could not be retrieved.")

    return saved_mission


def list_missions(
    db: Session,
    organization_id: UUID,
    limit: int = 20,
    offset: int = 0,
) -> list[Mission]:
    statement = (
        select(Mission)
        .where(Mission.organization_id == organization_id)
        .order_by(Mission.created_at.desc(), Mission.id.desc())
        .limit(limit)
        .offset(offset)
    )

    return list(db.scalars(statement).all())


def get_mission(
    db: Session,
    mission_id: UUID,
    organization_id: UUID,
) -> Mission | None:
    statement = (
        select(Mission)
        .where(
            Mission.id == mission_id,
            Mission.organization_id == organization_id,
        )
        .options(selectinload(Mission.routes))
    )

    return db.scalars(statement).one_or_none()


def delete_mission(
    db: Session,
    mission_id: UUID,
    organization_id: UUID,
) -> bool:
    try:
        statement = select(Mission).where(
            Mission.id == mission_id,
            Mission.organization_id == organization_id,
        )

        mission = db.scalar(statement)

        if mission is None:
            return False

        db.delete(mission)
        db.commit()
        return True

    except Exception:
        db.rollback()
        raise