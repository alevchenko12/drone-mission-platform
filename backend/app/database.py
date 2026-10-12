import os
from collections.abc import Generator
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import URL, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(PROJECT_ROOT / ".env", override=False)

hosted_database_url = os.getenv("DATABASE_URL", "").strip()

database_url: str | URL

if hosted_database_url:
    # Use the complete connection URL supplied by the hosting provider.
    database_url = hosted_database_url

    # Explicitly select our installed psycopg driver.
    if database_url.startswith("postgres://"):
        database_url = database_url.replace(
            "postgres://",
            "postgresql+psycopg://",
            1,
        )
    elif database_url.startswith("postgresql://"):
        database_url = database_url.replace(
            "postgresql://",
            "postgresql+psycopg://",
            1,
        )
else:
    # Fall back to the existing local Docker settings.
    password = os.getenv("POSTGRES_PASSWORD")

    if not password:
        raise RuntimeError("POSTGRES_PASSWORD is not configured.")

    database_url = URL.create(
        drivername="postgresql+psycopg",
        username=os.getenv("POSTGRES_USER", "drone_app"),
        password=password,
        host=os.getenv("POSTGRES_HOST", "127.0.0.1"),
        port=int(os.getenv("POSTGRES_PORT", "5433")),
        database=os.getenv("POSTGRES_DB", "drone_platform"),
    )

engine = create_engine(
    database_url,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    with SessionLocal() as session:
        yield session