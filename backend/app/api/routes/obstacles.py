import logging
from fastapi import APIRouter, HTTPException, Query
from app.api.schemas.obstacle import ObstacleListResponse
from app.services.overpass_service import fetch_building_obstacles
from app.services.obstacle_cache import (
    make_cache_key,
    get_cached_obstacles,
    set_cached_obstacles,
)

logger = logging.getLogger(__name__)

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

    lat_diff = max_lat - min_lat
    lon_diff = max_lon - min_lon

    if lat_diff > 0.015 or lon_diff > 0.015:
        raise HTTPException(
            status_code=400,
            detail="Map area too large. Please zoom in more."
        )

    cache_key = make_cache_key(min_lat, min_lon, max_lat, max_lon)

    cached_entry = get_cached_obstacles(cache_key)
    if cached_entry:
        return ObstacleListResponse(
            obstacles=cached_entry["obstacles"],
            count=len(cached_entry["obstacles"]),
            source_status="ok",
            cached=True,
        )

    try:
        obstacles = await fetch_building_obstacles(
            min_lat=min_lat,
            min_lon=min_lon,
            max_lat=max_lat,
            max_lon=max_lon,
        )

        set_cached_obstacles(cache_key, obstacles)

        return ObstacleListResponse(
            obstacles=obstacles,
            count=len(obstacles),
            source_status="ok",
            cached=False,
        )

    except RuntimeError as exc:
        logger.warning(f"Obstacle loading failed: {exc}")
        return ObstacleListResponse(
            obstacles=[],
            count=0,
            source_status="timeout",
            cached=False,
        )

    except Exception as exc:
        logger.exception("Unexpected obstacle loading failure")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load obstacles: {str(exc)}",
        )