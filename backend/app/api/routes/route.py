import logging

from fastapi import APIRouter, Depends, HTTPException

from app.api.schemas.route_schema import (
    RouteGenerateRequest,
    RouteGenerateResponse,
    MultiRouteGenerateRequest,
    MultiRouteGenerateResponse,
)
from app.auth_dependencies import (
    require_route_planner,
    require_trusted_origin,
)
from app.services.route_service import generate_route
from app.services.multi_route_service import generate_multi_routes


logger = logging.getLogger(__name__)

# These checks apply to every endpoint in this router.
# FastAPI runs them before entering the endpoint function.
router = APIRouter(
    prefix="/route",
    tags=["Route"],
    dependencies=[
        Depends(require_route_planner),
        Depends(require_trusted_origin),
    ],
)


@router.post("/generate", response_model=RouteGenerateResponse)
def generate_route_endpoint(
    request: RouteGenerateRequest,
) -> RouteGenerateResponse:
    try:
        route, distance = generate_route(request)

        return RouteGenerateResponse(
            route_coordinates=route,
            distance=distance,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from None

    except Exception:
        # Keep unexpected failure details in backend logs.
        logger.exception("Route generation failed")
        raise HTTPException(
            status_code=500,
            detail="Route generation failed.",
        ) from None


@router.post(
    "/generate-multi",
    response_model=MultiRouteGenerateResponse,
)
def generate_multi_route_endpoint(
    request: MultiRouteGenerateRequest,
) -> MultiRouteGenerateResponse:
    try:
        assignments = generate_multi_routes(request)

        return MultiRouteGenerateResponse(assignments=assignments)

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from None

    except Exception:
        logger.exception("Multi-route generation failed")
        raise HTTPException(
            status_code=500,
            detail="Multi-route generation failed.",
        ) from None