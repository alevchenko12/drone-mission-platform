from typing import List
from app.planner.models import GeoPoint, PlannerBounds, PlannerObstacle


DEFAULT_PADDING = 0.0005


def calculate_planner_bounds(
    start: GeoPoint,
    goal: GeoPoint,
    obstacles: List[PlannerObstacle],
    padding: float = DEFAULT_PADDING,
) -> PlannerBounds:
    """
    Build planner bounds from:
    - start point
    - goal point
    - all obstacle geometry points
    - a small extra padding area
    """
    latitudes = [start.lat, goal.lat]
    longitudes = [start.lon, goal.lon]

    for obstacle in obstacles:
        for point in obstacle.geometry:
            latitudes.append(point.lat)
            longitudes.append(point.lon)

    min_lat = min(latitudes) - padding
    max_lat = max(latitudes) + padding
    min_lon = min(longitudes) - padding
    max_lon = max(longitudes) + padding

    return PlannerBounds(
        min_lat=min_lat,
        min_lon=min_lon,
        max_lat=max_lat,
        max_lon=max_lon,
    )