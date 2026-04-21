import heapq
from math import sqrt
from typing import Dict, List, Optional, Tuple

from app.planner.grid import PlanningGrid
from app.planner.models import GridPoint


def heuristic(a: GridPoint, b: GridPoint) -> float:
    """
    Euclidean distance heuristic for A*.
    """
    return sqrt((a.row - b.row) ** 2 + (a.col - b.col) ** 2)


def movement_cost(a: GridPoint, b: GridPoint) -> float:
    """
    Cost of moving from one neighboring cell to another.
    Straight = 1
    Diagonal = sqrt(2)
    """
    row_diff = abs(a.row - b.row)
    col_diff = abs(a.col - b.col)

    if row_diff == 1 and col_diff == 1:
        return sqrt(2)
    return 1.0


def get_neighbors(grid: PlanningGrid, point: GridPoint) -> List[GridPoint]:
    """
    Return all valid neighboring cells (8-direction movement).
    """
    directions = [
        (-1, 0),   # up
        (1, 0),    # down
        (0, -1),   # left
        (0, 1),    # right
        (-1, -1),  # up-left
        (-1, 1),   # up-right
        (1, -1),   # down-left
        (1, 1),    # down-right
    ]

    neighbors: List[GridPoint] = []

    for d_row, d_col in directions:
        neighbor = GridPoint(row=point.row + d_row, col=point.col + d_col)

        if not grid.is_within_bounds(neighbor):
            continue

        if grid.is_blocked(neighbor):
            continue

        neighbors.append(neighbor)

    return neighbors


def reconstruct_path(
    came_from: Dict[GridPoint, GridPoint],
    current: GridPoint,
) -> List[GridPoint]:
    """
    Rebuild path from goal back to start.
    """
    path = [current]

    while current in came_from:
        current = came_from[current]
        path.append(current)

    path.reverse()
    return path


def astar_search(
    grid: PlanningGrid,
    start: GridPoint,
    goal: GridPoint,
) -> Optional[List[GridPoint]]:
    """
    Run A* search on the planning grid.

    Returns:
    - list of GridPoint from start to goal if path exists
    - None if no path exists
    """
    if not grid.is_within_bounds(start) or not grid.is_within_bounds(goal):
        raise ValueError("Start or goal is outside grid bounds.")

    if grid.is_blocked(start):
        raise ValueError("Start point is blocked.")

    if grid.is_blocked(goal):
        raise ValueError("Goal point is blocked.")

    open_heap: List[Tuple[float, int, GridPoint]] = []
    counter = 0

    heapq.heappush(open_heap, (0.0, counter, start))

    came_from: Dict[GridPoint, GridPoint] = {}

    g_score: Dict[GridPoint, float] = {start: 0.0}
    f_score: Dict[GridPoint, float] = {start: heuristic(start, goal)}

    open_set = {start}

    while open_heap:
        _, _, current = heapq.heappop(open_heap)

        if current not in open_set:
            continue

        open_set.remove(current)

        if current == goal:
            return reconstruct_path(came_from, current)

        for neighbor in get_neighbors(grid, current):
            tentative_g = g_score[current] + movement_cost(current, neighbor)

            if tentative_g < g_score.get(neighbor, float("inf")):
                came_from[neighbor] = current
                g_score[neighbor] = tentative_g
                f = tentative_g + heuristic(neighbor, goal)
                f_score[neighbor] = f

                if neighbor not in open_set:
                    counter += 1
                    heapq.heappush(open_heap, (f, counter, neighbor))
                    open_set.add(neighbor)

    return None