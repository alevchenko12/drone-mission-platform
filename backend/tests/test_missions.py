from copy import deepcopy
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Route


@pytest.fixture()
def mission_payload() -> dict:
    return {
        "name": "Test mission",
        "planning_inputs": {
            "start_points": [
                {"lat": 47.5, "lon": 19.04},
            ],
            "goal_points": [
                {"lat": 47.501, "lon": 19.041},
            ],
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
            },
        ],
    }


def test_missions_list_starts_empty(authenticated_client: TestClient) -> None:
    response = authenticated_client.get("/missions")

    assert response.status_code == 200
    assert response.json() == []


def test_save_and_retrieve_mission(
    authenticated_client: TestClient,
    mission_payload: dict,
) -> None:
    save_response = authenticated_client.post("/missions", json=mission_payload)

    assert save_response.status_code == 201

    saved = save_response.json()
    mission_id = saved["id"]

    # Both mission and route have valid UUIDs.
    UUID(mission_id)
    UUID(saved["routes"][0]["id"])

    assert saved["name"] == mission_payload["name"]
    assert saved["planning_inputs"] == mission_payload["planning_inputs"]
    assert saved["created_at"]
    assert len(saved["routes"]) == 1

    route = saved["routes"][0]
    expected_route = mission_payload["assignments"][0]

    assert route["drone_index"] == expected_route["drone_index"]
    assert route["goal_index"] == expected_route["goal_index"]
    assert route["route_coordinates"] == expected_route["route_coordinates"]
    assert route["distance"] == expected_route["distance"]

    get_response = authenticated_client.get(f"/missions/{mission_id}")

    assert get_response.status_code == 200
    assert get_response.json() == saved

    list_response = authenticated_client.get("/missions")

    assert list_response.status_code == 200
    summaries = list_response.json()
    assert len(summaries) == 1
    assert summaries[0]["id"] == mission_id
    assert summaries[0]["name"] == mission_payload["name"]

    # The list returns summaries, not full route data.
    assert "routes" not in summaries[0]
    assert "planning_inputs" not in summaries[0]


@pytest.mark.parametrize("name", ["", "   ", "x" * 121])
def test_reject_invalid_mission_name(
    authenticated_client: TestClient,
    mission_payload: dict,
    name: str,
) -> None:
    mission_payload["name"] = name

    response = authenticated_client.post("/missions", json=mission_payload)

    assert response.status_code == 422
    assert authenticated_client.get("/missions").json() == []


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("drone_index", -1),
        ("goal_index", -1),
        ("drone_index", 1),
        ("goal_index", 1),
        ("distance", -1),
        ("route_coordinates", []),
        ("route_coordinates", [[91, 19.04]]),
        ("route_coordinates", [[47.5, 181]]),
    ],
)
def test_reject_invalid_route(
    authenticated_client: TestClient,
    mission_payload: dict,
    field: str,
    value: object,
) -> None:
    mission_payload["assignments"][0][field] = value

    response = authenticated_client.post("/missions", json=mission_payload)

    assert response.status_code == 422
    assert authenticated_client.get("/missions").json() == []


def test_reject_duplicate_drone_assignment(
    authenticated_client: TestClient,
    mission_payload: dict,
) -> None:
    mission_payload["planning_inputs"]["start_points"].append(
        {"lat": 47.502, "lon": 19.042}
    )
    mission_payload["planning_inputs"]["goal_points"].append(
        {"lat": 47.503, "lon": 19.043}
    )

    second_route = deepcopy(mission_payload["assignments"][0])
    second_route["goal_index"] = 1

    # Two routes now refer to drone 0; drone 1 has no route.
    mission_payload["assignments"].append(second_route)

    response = authenticated_client.post("/missions", json=mission_payload)

    assert response.status_code == 422
    assert authenticated_client.get("/missions").json() == []


def test_missing_mission_returns_404(authenticated_client: TestClient) -> None:
    mission_id = uuid4()

    assert authenticated_client.get(f"/missions/{mission_id}").status_code == 404
    assert authenticated_client.delete(f"/missions/{mission_id}").status_code == 404


def test_invalid_mission_id_returns_422(authenticated_client: TestClient) -> None:
    response = authenticated_client.get("/missions/not-a-uuid")

    assert response.status_code == 422


def test_delete_mission_also_deletes_routes(
    authenticated_client: TestClient,
    db_session: Session,
    mission_payload: dict,
) -> None:
    save_response = authenticated_client.post("/missions", json=mission_payload)

    assert save_response.status_code == 201
    mission_id = save_response.json()["id"]

    delete_response = authenticated_client.delete(f"/missions/{mission_id}")

    assert delete_response.status_code == 204
    assert delete_response.content == b""
    assert authenticated_client.get(f"/missions/{mission_id}").status_code == 404
    assert authenticated_client.get("/missions").json() == []

    # Check the database directly for orphaned routes.
    remaining_route_ids = db_session.scalars(
        select(Route.id).where(Route.mission_id == UUID(mission_id))
    ).all()

    assert remaining_route_ids == []