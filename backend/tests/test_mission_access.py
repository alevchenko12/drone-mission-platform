from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Mission, Organization, Route, User
from app.security import hash_password


TEST_PASSWORD = "Access control test password"
TRUSTED_ORIGIN = {"Origin": "http://localhost:5173"}


@pytest.fixture()
def access_data(db_session: Session) -> dict:
    with db_session.begin():
        organization_a = Organization(name="Organization A")
        organization_b = Organization(name="Organization B")
        db_session.add_all([organization_a, organization_b])
        db_session.flush()

        users = [
            User(
                email="viewer-a@example.com",
                password_hash=hash_password(TEST_PASSWORD),
                organization_id=organization_a.id,
                role="viewer",
            ),
            User(
                email="operator-a@example.com",
                password_hash=hash_password(TEST_PASSWORD),
                organization_id=organization_a.id,
                role="operator",
            ),
            User(
                email="admin-a@example.com",
                password_hash=hash_password(TEST_PASSWORD),
                organization_id=organization_a.id,
                role="admin",
            ),
        ]
        db_session.add_all(users)

        planning_inputs = {
            "start_points": [{"lat": 47.5, "lon": 19.04}],
            "goal_points": [{"lat": 47.501, "lon": 19.041}],
            "obstacles": [],
            "drone_parameters": {
                "height": 14,
                "safety_margin": 5,
            },
        }

        mission_a = Mission(
            name="Mission A",
            organization_id=organization_a.id,
            planning_inputs=planning_inputs,
            routes=[
                Route(
                    drone_index=0,
                    goal_index=0,
                    route_coordinates=[
                        [47.5, 19.04],
                        [47.501, 19.041],
                    ],
                    distance=134,
                )
            ],
        )

        mission_b = Mission(
            name="Mission B",
            organization_id=organization_b.id,
            planning_inputs=planning_inputs,
            routes=[
                Route(
                    drone_index=0,
                    goal_index=0,
                    route_coordinates=[
                        [47.5, 19.04],
                        [47.501, 19.041],
                    ],
                    distance=134,
                )
            ],
        )

        db_session.add_all([mission_a, mission_b])
        db_session.flush()

        result = {
            "organization_a": organization_a.id,
            "organization_b": organization_b.id,
            "mission_a": mission_a.id,
            "mission_b": mission_b.id,
        }

    return result


@pytest.fixture()
def payload() -> dict:
    return {
        "name": "New mission",
        "planning_inputs": {
            "start_points": [{"lat": 47.5, "lon": 19.04}],
            "goal_points": [{"lat": 47.501, "lon": 19.041}],
            "obstacles": [],
            "drone_parameters": {
                "height": 14,
                "safety_margin": 5,
            },
        },
        "assignments": [
            {
                "drone_index": 0,
                "goal_index": 0,
                "route_coordinates": [
                    [47.5, 19.04],
                    [47.501, 19.041],
                ],
                "distance": 134,
            }
        ],
    }


def login_as(client: TestClient, role: str) -> None:
    response = client.post(
        "/auth/login",
        json={
            "email": f"{role}-a@example.com",
            "password": TEST_PASSWORD,
        },
        headers=TRUSTED_ORIGIN,
    )

    assert response.status_code == 200


def test_anonymous_user_cannot_list_missions(client: TestClient) -> None:
    assert client.get("/missions").status_code == 401


@pytest.mark.parametrize("role", ["viewer", "operator", "admin"])
def test_list_only_contains_own_organization_missions(
    client: TestClient,
    access_data: dict,
    role: str,
) -> None:
    login_as(client, role)

    response = client.get("/missions")

    assert response.status_code == 200
    mission_ids = {mission["id"] for mission in response.json()}
    assert mission_ids == {str(access_data["mission_a"])}


@pytest.mark.parametrize("role", ["viewer", "operator", "admin"])
def test_user_cannot_access_other_organization_mission(
    client: TestClient,
    access_data: dict,
    role: str,
) -> None:
    login_as(client, role)

    own_response = client.get(f"/missions/{access_data['mission_a']}")
    foreign_response = client.get(f"/missions/{access_data['mission_b']}")
    missing_response = client.get(f"/missions/{uuid4()}")

    assert own_response.status_code == 200
    assert foreign_response.status_code == 404
    assert foreign_response.json() == missing_response.json()


def test_viewer_cannot_save_mission(
    client: TestClient,
    access_data: dict,
    payload: dict,
) -> None:
    login_as(client, "viewer")

    response = client.post(
        "/missions",
        json=payload,
        headers=TRUSTED_ORIGIN,
    )

    assert response.status_code == 403
    assert len(client.get("/missions").json()) == 1


@pytest.mark.parametrize("role", ["operator", "admin"])
def test_new_mission_belongs_to_authenticated_organization(
    client: TestClient,
    db_session: Session,
    access_data: dict,
    payload: dict,
    role: str,
) -> None:
    login_as(client, role)

    response = client.post(
        "/missions",
        json=payload,
        headers=TRUSTED_ORIGIN,
    )

    assert response.status_code == 201

    mission = db_session.get(Mission, UUID(response.json()["id"]))

    assert mission is not None
    assert mission.organization_id == access_data["organization_a"]


def test_client_cannot_choose_another_organization(
    client: TestClient,
    access_data: dict,
    payload: dict,
) -> None:
    login_as(client, "operator")
    payload["organization_id"] = str(access_data["organization_b"])

    response = client.post(
        "/missions",
        json=payload,
        headers=TRUSTED_ORIGIN,
    )

    assert response.status_code == 422


@pytest.mark.parametrize("role", ["viewer", "operator"])
def test_non_admin_cannot_delete_mission(
    client: TestClient,
    access_data: dict,
    role: str,
) -> None:
    login_as(client, role)

    response = client.delete(
        f"/missions/{access_data['mission_a']}",
        headers=TRUSTED_ORIGIN,
    )

    assert response.status_code == 403
    assert client.get(
        f"/missions/{access_data['mission_a']}"
    ).status_code == 200


def test_admin_cannot_delete_other_organization_mission(
    client: TestClient,
    db_session: Session,
    access_data: dict,
) -> None:
    login_as(client, "admin")

    response = client.delete(
        f"/missions/{access_data['mission_b']}",
        headers=TRUSTED_ORIGIN,
    )

    assert response.status_code == 404
    assert db_session.get(Mission, access_data["mission_b"]) is not None