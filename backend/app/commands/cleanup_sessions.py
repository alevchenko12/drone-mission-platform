from datetime import datetime, timezone

from sqlalchemy import delete
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import UserSession


def cleanup_expired_sessions(
    db: Session,
    cutoff: datetime,
) -> int:
    result = db.execute(
        delete(UserSession).where(
            UserSession.expires_at <= cutoff
        )
    )

    return result.rowcount


def main() -> None:
    cutoff = datetime.now(timezone.utc)

    try:
        with SessionLocal() as db:
            with db.begin():
                deleted_count = cleanup_expired_sessions(db, cutoff)

        print(f"Deleted {deleted_count} expired sessions.")

    except SQLAlchemyError:
        print("Session cleanup failed. Check the database connection.")
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()