from fastapi import APIRouter, HTTPException, Query
from app.api.schemas.obstacle import ObstacleListResponse
from app.services.overpass_service import fetch_building_obstacles

router = APIRouter(prefix="/obstacles", tags=["obstacles"])


@router.get("", response_model=ObstacleListResponse)
async def get_obstacles(
    min_lat: float = Query(...),
    min_lon: float = Query(...),
    max_lat: float = Query(...),
    max_lon: float = Query(...),
):
    if min_lat >= max_lat or min_lon >= max_lon:
        raise HTTPException(status_code=400, detail="Invalid bounding box.")

    try:
        obstacles = await fetch_building_obstacles(
            min_lat=min_lat,
            min_lon=min_lon,
            max_lat=max_lat,
            max_lon=max_lon,
        )
        return ObstacleListResponse(
            obstacles=obstacles,
            count=len(obstacles),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load obstacles: {str(exc)}",
        )