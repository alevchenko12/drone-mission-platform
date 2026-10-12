from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class LoginRateLimit(Base):
    __tablename__ = "login_rate_limits"
    __table_args__ = (
        CheckConstraint(
            "attempt_count >= 1",
            name="ck_login_rate_limits_count_positive",
        ),
    )

    # A keyed hash of the client IP; not the raw IP address.
    key_hash: Mapped[str] = mapped_column(
        String(64),
        primary_key=True,
    )

    attempt_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    window_started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
    )