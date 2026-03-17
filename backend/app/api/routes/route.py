from fastapi import APIRouter
from app.api.schemas.route_schema import (
    RouteGenerateRequest,
    RouteGenerateResponse,
)
from app.services.route_service import generate_mock_route, calculate_mock_distance

router = APIRouter(prefix="/route", tags=["Route"])


@router.post("/generate", response_model=RouteGenerateResponse)
def generate_route(request: RouteGenerateRequest):
    route = generate_mock_route(request.start_point, request.goal_point)
    distance = calculate_mock_distance(request.start_point, request.goal_point)

    return RouteGenerateResponse(
        route_coordinates=route,
        distance=distance
    )