from math import sqrt
from typing import List

from app.api.schemas.route_schema import RouteGenerateRequest
from app.planner import (
    GeoPoint,
    PlannerObstacle,
    calculate_planner_bounds,
    PlanningGrid,
    block_obstacles_on_grid,
    astar_search,
)


DEFAULT_GRID_ROWS = 60
DEFAULT_GRID_COLS = 60


def to_geo_point(point) -> GeoPoint:
    return GeoPoint(lat=point.lat, lon=point.lon)


def to_planner_obstacle(obstacle) -> PlannerObstacle:
    geometry_points = [
        GeoPoint(lat=coords[0], lon=coords[1])
        for coords in obstacle.geometry
        if len(coords) == 2
    ]

    return PlannerObstacle(
        id=obstacle.id or "",
        source=obstacle.source or "unknown",
        type=obstacle.type or "unknown",
        geometry=geometry_points,
        height=obstacle.height or 0.0,
    )


def path_to_route_coordinates(grid: PlanningGrid, path) -> List[List[float]]:
    route_coordinates: List[List[float]] = []

    for grid_point in path:
        geo_point = grid.converter.grid_to_geo_center(grid_point)
        route_coordinates.append([geo_point.lat, geo_point.lon])

    return route_coordinates


def calculate_route_distance(route_coordinates: List[List[float]]) -> float:
    if len(route_coordinates) < 2:
        return 0.0

    distance = 0.0

    for i in range(1, len(route_coordinates)):
        prev_lat, prev_lon = route_coordinates[i - 1]
        curr_lat, curr_lon = route_coordinates[i]

        d_lat = curr_lat - prev_lat
        d_lon = curr_lon - prev_lon

        distance += sqrt(d_lat ** 2 + d_lon ** 2)

    return distance


def generate_route(request: RouteGenerateRequest):
    start = to_geo_point(request.start_point)
    goal = to_geo_point(request.goal_point)
    obstacles = [to_planner_obstacle(obs) for obs in request.obstacles]

    bounds = calculate_planner_bounds(start, goal, obstacles)

    grid = PlanningGrid(
        bounds=bounds,
        rows=DEFAULT_GRID_ROWS,
        cols=DEFAULT_GRID_COLS,
    )

    block_obstacles_on_grid(
        grid=grid,
        obstacles=obstacles,
        drone_height=request.drone_parameters.height,
        safety_margin=request.drone_parameters.safety_margin,
    )

    start_grid = grid.converter.geo_to_grid(start)
    goal_grid = grid.converter.geo_to_grid(goal)

    path = astar_search(grid, start_grid, goal_grid)

    if path is None:
        raise ValueError("No valid route found.")

    route_coordinates = path_to_route_coordinates(grid, path)
    distance = calculate_route_distance(route_coordinates)

    return route_coordinates, distance