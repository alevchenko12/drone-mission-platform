from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.schemas.mission_schema import MissionCreate
from app.models import Mission, Route


DEMO_ORGANIZATION_ID = UUID("00000000-0000-0000-0000-000000000001")


def save_mission(db: Session, payload: MissionCreate) -> Mission:
    mission = Mission(
        organization_id=DEMO_ORGANIZATION_ID,
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
    
    
    # Save the mission and its routes in one transaction.
    # A failure inside this block rolls back the changes.
    with db.begin():
        db.add(mission)
        db.flush()
        db.refresh(mission, attribute_names=["created_at"])
        result_id = mission.id

    # Retrieve the saved mission together with its routes.
    saved_mission = get_mission(db, result_id)

    if saved_mission is None:
        raise RuntimeError("Saved mission could not be retrieved.")

    return saved_mission


def list_missions(
    db: Session,
    limit: int = 20,
    offset: int = 0,
) -> list[Mission]:
    statement = (
        select(Mission)
        .order_by(Mission.created_at.desc(), Mission.id.desc())
        .limit(limit)
        .offset(offset)
    )

    return list(db.scalars(statement).all())


def get_mission(db: Session, mission_id: UUID) -> Mission | None:
    statement = (
        select(Mission)
        .where(Mission.id == mission_id)
        .options(selectinload(Mission.routes))
    )

    return db.scalars(statement).one_or_none()


def delete_mission(db: Session, mission_id: UUID) -> bool:
    with db.begin():
        mission = db.get(Mission, mission_id)

        if mission is None:
            return False

        db.delete(mission)

    return True