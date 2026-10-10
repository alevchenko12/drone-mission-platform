from getpass import getpass
from uuid import UUID

from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.database import SessionLocal
from app.models import Organization, User
from app.security import hash_password


DEMO_ORGANIZATION_ID = UUID("00000000-0000-0000-0000-000000000001")
VALID_ROLES = {"admin", "operator", "viewer"}


def main() -> None:
    email_input = input("Email: ").strip().lower()

    try:
        email = str(TypeAdapter(EmailStr).validate_python(email_input))
    except ValidationError:
        print("Please enter a valid email address.")
        return

    role = input("Role [viewer]: ").strip().lower() or "viewer"

    if role not in VALID_ROLES:
        print("Role must be admin, operator or viewer.")
        return

    password = getpass("Password (at least 15 characters): ")
    confirmation = getpass("Confirm password: ")

    if len(password) < 15:
        print("Password must contain at least 15 characters.")
        return

    if password != confirmation:
        print("Passwords do not match.")
        return

    # Hash the password before storing anything.
    password_hash = hash_password(password)

    try:
        with SessionLocal() as db:
            with db.begin():
                organization = db.get(
                    Organization,
                    DEMO_ORGANIZATION_ID,
                )

                if organization is None:
                    print("Demo organization is missing. Apply migrations first.")
                    return

                existing_user = db.scalar(
                    select(User).where(User.email == email)
                )

                if existing_user is not None:
                    print("A user with this email already exists.")
                    return

                user = User(
                    email=email,
                    password_hash=password_hash,
                    organization_id=organization.id,
                    role=role,
                )

                db.add(user)

        print(f"Created {role} account for {email} in Demo organization.")

    except IntegrityError:
        print("Account creation failed because of a database constraint.")
    except SQLAlchemyError:
        print("Account creation failed. Check your database connection.")


if __name__ == "__main__":
    main()