from fastapi import APIRouter, HTTPException
from app.api.schemas.route_schema import (
    RouteGenerateRequest,
    RouteGenerateResponse,
)
from app.services.route_service import generate_route as generate_real_route

router = APIRouter(prefix="/route", tags=["Route"])


@router.post("/generate", response_model=RouteGenerateResponse)
def generate_route(request: RouteGenerateRequest):
    try:
        route, distance = generate_real_route(request)

        return RouteGenerateResponse(
            route_coordinates=route,
            distance=distance,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Route generation failed: {str(e)}")