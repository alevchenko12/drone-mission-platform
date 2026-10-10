"""Add organizations and mission ownership

Revision ID: c454b4fd9450
Revises: bd32803e677f
Create Date: 2026-10-10 11:53:54.061178

"""
from typing import Sequence, Union
from uuid import UUID

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c454b4fd9450'
down_revision: Union[str, Sequence[str], None] = 'bd32803e677f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

DEMO_ORGANIZATION_ID = UUID("00000000-0000-0000-0000-000000000001")


def upgrade() -> None:
    op.create_table(
        "organizations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "length(trim(name)) > 0",
            name="ck_organizations_name_not_blank",
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    organizations = sa.table(
        "organizations",
        sa.column("id", sa.Uuid()),
        sa.column("name", sa.String(length=120)),
    )

    op.bulk_insert(
        organizations,
        [
            {
                "id": DEMO_ORGANIZATION_ID,
                "name": "Demo organization",
            },
        ],
    )

    # Allow NULL temporarily so existing rows remain valid.
    op.add_column(
        "missions",
        sa.Column("organization_id", sa.Uuid(), nullable=True),
    )

    # Assign all existing missions to the Demo organization.
    op.execute(
        sa.text(
            """
            UPDATE missions
            SET organization_id = :organization_id
            WHERE organization_id IS NULL
            """
        ).bindparams(organization_id=DEMO_ORGANIZATION_ID)
    )

    op.create_foreign_key(
        "fk_missions_organization_id",
        "missions",
        "organizations",
        ["organization_id"],
        ["id"],
        ondelete="RESTRICT",
    )

    # Every existing mission now has an owner.
    op.alter_column(
        "missions",
        "organization_id",
        existing_type=sa.Uuid(),
        nullable=False,
    )

    op.create_index(
        "ix_missions_organization_id",
        "missions",
        ["organization_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_missions_organization_id",
        table_name="missions",
    )

    op.drop_constraint(
        "fk_missions_organization_id",
        "missions",
        type_="foreignkey",
    )

    op.drop_column("missions", "organization_id")
    op.drop_table("organizations")