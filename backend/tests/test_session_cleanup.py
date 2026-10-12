from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.commands.cleanup_sessions import cleanup_expired_sessions
from app.models import User, UserSession
from app.services.auth_service import hash_session_token


def test_cleanup_removes_only_expired_sessions(
    db_session: Session,
    admin_user: UUID,
) -> None:
    cutoff = datetime.now(timezone.utc)

    expired_hash = hash_session_token("expired-test-session")
    boundary_hash = hash_session_token("boundary-test-session")
    active_hash = hash_session_token("active-test-session")

    with db_session.begin():
        db_session.add_all(
            [
                UserSession(
                    user_id=admin_user,
                    token_hash=expired_hash,
                    expires_at=cutoff - timedelta(minutes=1),
                ),
                UserSession(
                    user_id=admin_user,
                    token_hash=boundary_hash,
                    expires_at=cutoff,
                ),
                UserSession(
                    user_id=admin_user,
                    token_hash=active_hash,
                    expires_at=cutoff + timedelta(hours=1),
                ),
            ]
        )
        db_session.flush()

        deleted_count = cleanup_expired_sessions(db_session, cutoff)

        remaining_hashes = set(
            db_session.scalars(
                select(UserSession.token_hash).where(
                    UserSession.user_id == admin_user
                )
            ).all()
        )

        assert deleted_count == 2
        assert remaining_hashes == {active_hash}

        # Removing sessions must not remove their user.
        assert db_session.get(User, admin_user) is not None

        # Repeating cleanup is safe: nothing else should be deleted.
        assert cleanup_expired_sessions(db_session, cutoff) == 0