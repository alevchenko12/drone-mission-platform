from fastapi import APIRouter
from app.api.schemas.route_schema import RouteGenerateRequest, RouteGenerateResponse
from app.services.route_service import generate_mock_route

router = APIRouter()


@router.post("/route/generate", response_model=RouteGenerateResponse)
def generate_route(request: RouteGenerateRequest):
    route = generate_mock_route(request.start_point, request.goal_point)

    return {
        "route_coordinates": route,
        "distance": 0.0
    }