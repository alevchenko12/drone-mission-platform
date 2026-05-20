"""
Service functions for planning routes for multiple drones.
"""

from __future__ import annotations

from functools import lru_cache
from math import inf, isinf
from typing import Dict, List, Optional, Tuple

from app.planner import (
    GeoPoint,
    PlannerBounds,
    PlanningGrid,
    astar_search,
    block_obstacles_on_grid,
)

from app.services.route_service import (
    calculate_route_distance,
    path_to_route_coordinates,
    to_geo_point,
    to_planner_obstacle,
)


def _compute_costs_and_paths(
    base_grid: PlanningGrid,
    starts: List[GeoPoint],
    goals: List[GeoPoint],
) -> Tuple[List[List[float]], List[List[Optional[List]]]]:
    n = len(starts)
    cost_matrix = [[inf for _ in range(n)] for _ in range(n)]
    path_matrix = [[None for _ in range(n)] for _ in range(n)]

    for i, start in enumerate(starts):
        start_grid = base_grid.converter.geo_to_grid(start)

        for j, goal in enumerate(goals):
            goal_grid = base_grid.converter.geo_to_grid(goal)

            try:
                path = astar_search(base_grid, start_grid, goal_grid)
            except Exception:
                path = None

            if path:
                coordinates = path_to_route_coordinates(base_grid, path)
                cost_matrix[i][j] = calculate_route_distance(coordinates)
                path_matrix[i][j] = path

    return cost_matrix, path_matrix


def _validate_cost_matrix(cost_matrix: List[List[float]]) -> None:
    if not cost_matrix:
        raise ValueError("No drones or goals were provided.")

    for drone_index, row in enumerate(cost_matrix):
        if all(isinf(cost) for cost in row):
            raise ValueError(
                f"Drone {drone_index + 1} cannot reach any goal. "
                "Try moving the drone/goal or reducing blocking obstacles."
            )

    number_of_goals = len(cost_matrix[0])

    for goal_index in range(number_of_goals):
        if all(isinf(row[goal_index]) for row in cost_matrix):
            raise ValueError(
                f"Goal {goal_index + 1} cannot be reached by any drone. "
                "Try moving the goal or reducing blocking obstacles."
            )


def _solve_assignment(cost_matrix: List[List[float]]) -> List[int]:
    n = len(cost_matrix)
    _validate_cost_matrix(cost_matrix)

    @lru_cache(maxsize=None)
    def best_cost(mask: int, row: int) -> float:
        if row == n:
            return 0.0

        best = inf

        for col in range(n):
            if mask & (1 << col):
                continue

            if isinf(cost_matrix[row][col]):
                continue

            candidate = cost_matrix[row][col] + best_cost(
                mask | (1 << col),
                row + 1,
            )

            if candidate < best:
                best = candidate

        return best

    total_best_cost = best_cost(0, 0)

    if isinf(total_best_cost):
        raise ValueError(
            "No valid assignment found. Some drones cannot reach goals."
        )

    assignment = [-1 for _ in range(n)]

    def reconstruct(mask: int, row: int) -> None:
        if row == n:
            return

        best = inf
        best_col = -1

        for col in range(n):
            if mask & (1 << col):
                continue

            if isinf(cost_matrix[row][col]):
                continue

            candidate = cost_matrix[row][col] + best_cost(
                mask | (1 << col),
                row + 1,
            )

            if candidate < best:
                best = candidate
                best_col = col

        if best_col == -1:
            raise ValueError(
                "No valid assignment found. Some drones cannot reach goals."
            )

        assignment[row] = best_col
        reconstruct(mask | (1 << best_col), row + 1)

    reconstruct(0, 0)
    return assignment


def _copy_base_grid(
    base_grid: PlanningGrid,
    bounds: PlannerBounds,
    rows: int,
    cols: int,
) -> PlanningGrid:
    grid = PlanningGrid(bounds=bounds, rows=rows, cols=cols)

    for row in range(rows):
        for col in range(cols):
            if base_grid.cells[row][col] == 1:
                grid.cells[row][col] = 1

    return grid


def generate_multi_routes(request) -> List[Dict[str, object]]:
    starts = [to_geo_point(point) for point in request.start_points]
    goals = [to_geo_point(point) for point in request.goal_points]

    if len(starts) != len(goals):
        raise ValueError("Number of start points and goal points must be equal.")

    if len(starts) == 0:
        raise ValueError("At least one drone and one goal are required.")

    obstacles = [to_planner_obstacle(obstacle) for obstacle in request.obstacles]

    latitudes = [point.lat for point in starts + goals]
    longitudes = [point.lon for point in starts + goals]

    for obstacle in obstacles:
        for point in obstacle.geometry:
            latitudes.append(point.lat)
            longitudes.append(point.lon)

    padding = 0.0005

    bounds = PlannerBounds(
        min_lat=min(latitudes) - padding,
        min_lon=min(longitudes) - padding,
        max_lat=max(latitudes) + padding,
        max_lon=max(longitudes) + padding,
    )

    rows = 60
    cols = 60

    base_grid = PlanningGrid(bounds=bounds, rows=rows, cols=cols)

    block_obstacles_on_grid(
        base_grid,
        obstacles,
        drone_height=request.drone_parameters.height,
        safety_margin=request.drone_parameters.safety_margin,
    )

    cost_matrix, _ = _compute_costs_and_paths(base_grid, starts, goals)
    assignment = _solve_assignment(cost_matrix)

    blocked_cells: set[Tuple[int, int]] = set()
    results: List[Dict[str, object]] = []

    for drone_index, goal_index in enumerate(assignment):
        if goal_index < 0 or goal_index >= len(goals):
            raise ValueError("Invalid assignment produced.")

        grid = _copy_base_grid(base_grid, bounds, rows, cols)

        start_grid = grid.converter.geo_to_grid(starts[drone_index])
        goal_grid = grid.converter.geo_to_grid(goals[goal_index])

        for row, col in blocked_cells:
            if (row, col) == (start_grid.row, start_grid.col):
                continue

            if (row, col) == (goal_grid.row, goal_grid.col):
                continue

            if 0 <= row < rows and 0 <= col < cols:
                grid.cells[row][col] = 1

        try:
            path = astar_search(grid, start_grid, goal_grid)
        except Exception:
            path = None

        if not path:
            raise ValueError(
                f"No collision-free route found for Drone {drone_index + 1} "
                f"to Goal {goal_index + 1}. Try moving points farther apart "
                "or reducing obstacles."
            )

        for cell in path:
            blocked_cells.add((cell.row, cell.col))

        coordinates = path_to_route_coordinates(grid, path)
        distance = calculate_route_distance(coordinates)

        results.append(
            {
                "drone_index": drone_index,
                "goal_index": goal_index,
                "route_coordinates": coordinates,
                "distance": distance,
            }
        )

    return results