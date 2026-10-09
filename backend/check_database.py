from sqlalchemy import text

from app.database import engine


def main():
    try:
        with engine.connect() as connection:
            row = connection.execute(
                text("SELECT current_database(), current_user")
            ).one()

            print(f"Database: {row[0]}")
            print(f"User: {row[1]}")
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()