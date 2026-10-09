from datetime import datetime
from typing import TYPE_CHECKING, Any
from uuid import UUID, uuid4

from sqlalchemy import CheckConstraint, DateTime, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.route import Route


class Mission(Base):
    __tablename__ = "missions"
    __table_args__ = (
        CheckConstraint(
            "length(trim(name)) > 0",
            name="ck_missions_name_not_blank",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        primary_key=True,
        default=uuid4,
    )

    name: Mapped[str] = mapped_column(
        String(120),
        nullable=False,
    )

    # Snapshot of the request used to generate this plan.
    planning_inputs: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    routes: Mapped[list["Route"]] = relationship(
        back_populates="mission",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="Route.drone_index",
    )