from uuid import UUID
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import User
from app.security import hash_password


TEST_PASSWORD = "Planning access test password"
TRUSTED_ORIGIN = {"Origin": "http://localhost:5173"}


@pytest.fixture()
def planning_users(db_session: Session) -> None:
    with db_session.begin():
        for role in ("viewer", "operator", "admin"):
            db_session.add(
                User(
                    email=f"planning-{role}@example.com",
                    password_hash=hash_password(TEST_PASSWORD),
                    organization_id=UUID(
                        "00000000-0000-0000-0000-000000000001"
                    ),
                    role=role,
                )
            )


def login_as(client: TestClient, role: str) -> None:
    response = client.post(
        "/auth/login",
        json={
            "email": f"planning-{role}@example.com",
            "password": TEST_PASSWORD,
        },
        headers=TRUSTED_ORIGIN,
    )

    assert response.status_code == 200


@pytest.fixture()
def single_payload() -> dict:
    return {
        "start_point": {"lat": 47.5, "lon": 19.04},
        "goal_point": {"lat": 47.501, "lon": 19.041},
        "obstacles": [],
        "drone_parameters": {
            "height": 14,
            "safety_margin": 5,
        },
    }


@pytest.fixture()
def multi_payload() -> dict:
    return {
        "start_points": [{"lat": 47.5, "lon": 19.04}],
        "goal_points": [{"lat": 47.501, "lon": 19.041}],
        "obstacles": [],
        "drone_parameters": {
            "height": 14,
            "safety_margin": 5,
        },
    }


@pytest.mark.parametrize(
    ("endpoint", "function_name"),
    [
        ("/route/generate", "generate_route"),
        ("/route/generate-multi", "generate_multi_routes"),
    ],
)
def test_anonymous_user_cannot_generate_routes(
    client: TestClient,
    single_payload: dict,
    multi_payload: dict,
    endpoint: str,
    function_name: str,
) -> None:
    payload = (
        single_payload
        if endpoint == "/route/generate"
        else multi_payload
    )

    with patch(f"app.api.routes.route.{function_name}") as planner:
        response = client.post(
            endpoint,
            json=payload,
            headers=TRUSTED_ORIGIN,
        )

        assert response.status_code == 401
        planner.assert_not_called()


@pytest.mark.parametrize(
    ("endpoint", "function_name"),
    [
        ("/route/generate", "generate_route"),
        ("/route/generate-multi", "generate_multi_routes"),
    ],
)
def test_viewer_cannot_generate_routes(
    client: TestClient,
    planning_users: None,
    single_payload: dict,
    multi_payload: dict,
    endpoint: str,
    function_name: str,
) -> None:
    login_as(client, "viewer")

    payload = (
        single_payload
        if endpoint == "/route/generate"
        else multi_payload
    )

    with patch(f"app.api.routes.route.{function_name}") as planner:
        response = client.post(
            endpoint,
            json=payload,
            headers=TRUSTED_ORIGIN,
        )

        assert response.status_code == 403
        planner.assert_not_called()


@pytest.mark.parametrize("role", ["operator", "admin"])
def test_operator_and_admin_can_generate_single_route(
    client: TestClient,
    planning_users: None,
    single_payload: dict,
    role: str,
) -> None:
    login_as(client, role)

    with patch(
        "app.api.routes.route.generate_route",
        return_value=(
            [[47.5, 19.04], [47.501, 19.041]],
            134,
        ),
    ) as planner:
        response = client.post(
            "/route/generate",
            json=single_payload,
            headers=TRUSTED_ORIGIN,
        )

        assert response.status_code == 200
        assert response.json()["distance"] == 134
        planner.assert_called_once()


@pytest.mark.parametrize("role", ["operator", "admin"])
def test_operator_and_admin_can_generate_multi_route(
    client: TestClient,
    planning_users: None,
    multi_payload: dict,
    role: str,
) -> None:
    login_as(client, role)

    assignments = [
        {
            "drone_index": 0,
            "goal_index": 0,
            "route_coordinates": [
                [47.5, 19.04],
                [47.501, 19.041],
            ],
            "distance": 134,
        }
    ]

    with patch(
        "app.api.routes.route.generate_multi_routes",
        return_value=assignments,
    ) as planner:
        response = client.post(
            "/route/generate-multi",
            json=multi_payload,
            headers=TRUSTED_ORIGIN,
        )

        assert response.status_code == 200
        assert len(response.json()["assignments"]) == 1
        planner.assert_called_once()
        
def test_anonymous_user_cannot_load_obstacles(
    client: TestClient,
) -> None:
    with patch(
        "app.api.routes.obstacles.get_cached_obstacles"
    ) as cache_lookup:
        response = client.get(
            "/obstacles",
            params={
                "min_lat": 47.5,
                "min_lon": 19.04,
                "max_lat": 47.501,
                "max_lon": 19.041,
            },
        )

        assert response.status_code == 401
        cache_lookup.assert_not_called()


@pytest.mark.parametrize("role", ["viewer", "operator", "admin"])
def test_all_logged_in_roles_can_load_obstacles(
    client: TestClient,
    planning_users: None,
    role: str,
) -> None:
    login_as(client, role)

    # Use the cache path so the test makes no external Overpass request.
    with patch(
        "app.api.routes.obstacles.get_cached_obstacles",
        return_value={"obstacles": []},
    ) as cache_lookup:
        response = client.get(
            "/obstacles",
            params={
                "min_lat": 47.5,
                "min_lon": 19.04,
                "max_lat": 47.501,
                "max_lon": 19.041,
            },
        )

        assert response.status_code == 200
        assert response.json()["cached"] is True
        assert response.json()["obstacles"] == []
        cache_lookup.assert_called_once()


@pytest.mark.parametrize(
    ("endpoint", "function_name"),
    [
        ("/route/generate", "generate_route"),
        ("/route/generate-multi", "generate_multi_routes"),
    ],
)
@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"Origin": "https://untrusted.example"},
    ],
)
def test_route_generation_requires_trusted_origin(
    client: TestClient,
    planning_users: None,
    single_payload: dict,
    multi_payload: dict,
    endpoint: str,
    function_name: str,
    headers: dict,
) -> None:
    login_as(client, "operator")

    payload = (
        single_payload
        if endpoint == "/route/generate"
        else multi_payload
    )

    with patch(f"app.api.routes.route.{function_name}") as planner:
        response = client.post(
            endpoint,
            json=payload,
            headers=headers,
        )

        assert response.status_code == 403
        planner.assert_not_called()