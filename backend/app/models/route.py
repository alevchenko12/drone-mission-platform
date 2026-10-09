from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    Float,
    ForeignKey,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.mission import Mission


class Route(Base):
    __tablename__ = "routes"
    __table_args__ = (
        UniqueConstraint(
            "mission_id",
            "drone_index",
            name="uq_routes_mission_drone",
        ),
        UniqueConstraint(
            "mission_id",
            "goal_index",
            name="uq_routes_mission_goal",
        ),
        CheckConstraint(
            "drone_index >= 0",
            name="ck_routes_drone_index_nonnegative",
        ),
        CheckConstraint(
            "goal_index >= 0",
            name="ck_routes_goal_index_nonnegative",
        ),
        CheckConstraint(
            "distance >= 0 AND distance < 'Infinity'::double precision",
            name="ck_routes_distance_valid",
        ),
        CheckConstraint(
            "jsonb_typeof(route_coordinates) = 'array' "
            "AND jsonb_array_length(route_coordinates) > 0",
            name="ck_routes_coordinates_nonempty",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        primary_key=True,
        default=uuid4,
    )

    mission_id: Mapped[UUID] = mapped_column(
        ForeignKey("missions.id", ondelete="CASCADE"),
        nullable=False,
    )

    drone_index: Mapped[int] = mapped_column(nullable=False)
    goal_index: Mapped[int] = mapped_column(nullable=False)

    route_coordinates: Mapped[list[list[float]]] = mapped_column(
        JSONB,
        nullable=False,
    )

    distance: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )

    mission: Mapped["Mission"] = relationship(
        back_populates="routes",
    )