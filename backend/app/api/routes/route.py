from fastapi import APIRouter, HTTPException
from app.api.schemas.route_schema import (
    RouteGenerateRequest, RouteGenerateResponse,
    MultiRouteGenerateRequest, MultiRouteGenerateResponse
)
from app.services.route_service import generate_route
from app.services.multi_route_service import generate_multi_routes

router = APIRouter(prefix="/route", tags=["Route"])

@router.post("/generate", response_model=RouteGenerateResponse)
def generate_route_endpoint(request: RouteGenerateRequest):
    try:
        route, distance = generate_route(request)
        return RouteGenerateResponse(route_coordinates=route, distance=distance)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Route generation failed: {str(e)}")

@router.post("/generate-multi", response_model=MultiRouteGenerateResponse)
def generate_multi_route_endpoint(request: MultiRouteGenerateRequest):
    try:
        assignments = generate_multi_routes(request)
        return MultiRouteGenerateResponse(assignments=assignments)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Multi-route generation failed: {str(e)}")