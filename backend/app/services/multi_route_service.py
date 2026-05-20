"""
Service functions for planning routes for multiple drones.

Given a list of drone starting positions and a list of target locations,
the service computes an assignment and then plans collision‑free paths
for all drones.  The assignment is solved via a bitmask DP (similar to
the Hungarian method) and the routes are planned sequentially using A*.
"""
from __future__ import annotations
from typing import List, Optional, Dict, Tuple
from functools import lru_cache
from math import inf

from app.planner import (
    GeoPoint, PlannerObstacle, PlannerBounds,
    calculate_planner_bounds, PlanningGrid,
    block_obstacles_on_grid, astar_search
)
from app.services.route_service import (
    to_geo_point, to_planner_obstacle,
    path_to_route_coordinates, calculate_route_distance
)

def _compute_costs_and_paths(base_grid: PlanningGrid,
                             starts: List[GeoPoint],
                             goals: List[GeoPoint]
                             ) -> Tuple[List[List[float]],
                                        List[List[Optional[List]]]]:
    """Compute distance costs and raw grid paths between each start and goal."""
    n = len(starts)
    cost_matrix = [[inf]*n for _ in range(n)]
    path_matrix = [[None]*n for _ in range(n)]
    for i, s in enumerate(starts):
        start_grid = base_grid.converter.geo_to_grid(s)
        for j, g in enumerate(goals):
            goal_grid = base_grid.converter.geo_to_grid(g)
            try:
                path = astar_search(base_grid, start_grid, goal_grid)
            except Exception:
                path = None
            if path:
                coords = path_to_route_coordinates(base_grid, path)
                cost_matrix[i][j] = calculate_route_distance(coords)
                path_matrix[i][j] = path
            else:
                cost_matrix[i][j] = inf
                path_matrix[i][j] = None
    return cost_matrix, path_matrix

def _solve_assignment(cost_matrix: List[List[float]]) -> List[int]:
    """Solve the assignment problem via bitmask DP (for ≤10 drones)."""
    n = len(cost_matrix)
    @lru_cache(maxsize=None)
    def best_cost(mask: int, row: int) -> float:
        if row == n:
            return 0.0
        best = inf
        for col in range(n):
            if not (mask & (1 << col)):
                best = min(best, cost_matrix[row][col] +
                           best_cost(mask | (1 << col), row + 1))
        return best
    assignment = [-1]*n
    def reconstruct(mask: int, row: int) -> None:
        if row == n:
            return
        best = inf
        best_col = -1
        for col in range(n):
            if not (mask & (1 << col)):
                cost = cost_matrix[row][col] + \
                       best_cost(mask | (1 << col), row + 1)
                if cost < best:
                    best, best_col = cost, col
        assignment[row] = best_col
        reconstruct(mask | (1 << best_col), row + 1)
    reconstruct(0, 0)
    return assignment

def generate_multi_routes(request) -> List[Dict[str, object]]:
    """
    Plan routes for multiple drones.

    The request must expose .start_points and .goal_points (equal length).
    Returns a list of dictionaries with keys: drone_index, goal_index,
    route_coordinates and distance.
    """
    starts = [to_geo_point(p) for p in request.start_points]
    goals = [to_geo_point(p) for p in request.goal_points]
    if len(starts) != len(goals):
        raise ValueError("Number of start points and goal points must be equal.")
    obstacles = [to_planner_obstacle(obs) for obs in request.obstacles]

    # Build bounds covering all starts, goals and obstacle vertices
    latitudes = [p.lat for p in starts + goals]
    longitudes = [p.lon for p in starts + goals]
    for obs in obstacles:
        for pt in obs.geometry:
            latitudes.append(pt.lat)
            longitudes.append(pt.lon)
    padding = 0.0005
    bounds = PlannerBounds(min_lat=min(latitudes) - padding,
                           min_lon=min(longitudes) - padding,
                           max_lat=max(latitudes) + padding,
                           max_lon=max(longitudes) + padding)
    rows = cols = 60
    base_grid = PlanningGrid(bounds=bounds, rows=rows, cols=cols)
    block_obstacles_on_grid(base_grid, obstacles,
                            drone_height=request.drone_parameters.height,
                            safety_margin=request.drone_parameters.safety_margin)

    # Precompute costs and solve assignment
    cost_matrix, _ = _compute_costs_and_paths(base_grid, starts, goals)
    assignment = _solve_assignment(cost_matrix)

    # Sequentially plan each route on a fresh grid, reserving cells to avoid crossings
    blocked_cells: set[Tuple[int, int]] = set()
    results = []
    for drone_idx, goal_idx in enumerate(assignment):
        if goal_idx < 0 or goal_idx >= len(goals):
            raise ValueError("Invalid assignment produced.")
        # Build a fresh grid copy and apply reserved cells
        grid = PlanningGrid(bounds=bounds, rows=rows, cols=cols)
        for r in range(rows):
            for c in range(cols):
                if base_grid.cells[r][c] == 1:
                    grid.cells[r][c] = 1
        for (r, c) in blocked_cells:
            if 0 <= r < rows and 0 <= c < cols:
                grid.cells[r][c] = 1
        s_grid = grid.converter.geo_to_grid(starts[drone_idx])
        g_grid = grid.converter.geo_to_grid(goals[goal_idx])
        path = astar_search(grid, s_grid, g_grid)
        if path is None:
            raise ValueError(f"No valid route found for drone {drone_idx} to goal {goal_idx}.")
        # Mark cells used by this path as blocked for subsequent drones
        for cell in path:
            blocked_cells.add((cell.row, cell.col))
        coords = path_to_route_coordinates(grid, path)
        distance = calculate_route_distance(coords)
        results.append({
            "drone_index": drone_idx,
            "goal_index": goal_idx,
            "route_coordinates": coords,
            "distance": distance,
        })
    return results