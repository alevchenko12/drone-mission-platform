from typing import List
from app.planner.models import GeoPoint, GridPoint, PlannerObstacle
from app.planner.grid import PlanningGrid


def should_block_obstacle(
    obstacle: PlannerObstacle,
    drone_height: float,
    safety_margin: float,
) -> bool:
    """
    Decide whether this obstacle should block the route.

    Rule from the design:
    if drone_height < obstacle_height + safety_margin
    then the path must avoid the obstacle.
    """
    obstacle_height = obstacle.height or 0.0
    return drone_height < (obstacle_height + safety_margin)


def point_in_polygon(point: GeoPoint, polygon: List[GeoPoint]) -> bool:
    """
    Ray-casting algorithm for testing whether a point is inside a polygon.
    Works for simple polygons.
    """
    if len(polygon) < 3:
        return False

    inside = False
    j = len(polygon) - 1

    for i in range(len(polygon)):
        xi, yi = polygon[i].lon, polygon[i].lat
        xj, yj = polygon[j].lon, polygon[j].lat
        px, py = point.lon, point.lat

        intersects = ((yi > py) != (yj > py)) and (
            px < (xj - xi) * (py - yi) / ((yj - yi) + 1e-12) + xi
        )

        if intersects:
            inside = not inside

        j = i

    return inside


def block_obstacle_on_grid(
    grid: PlanningGrid,
    obstacle: PlannerObstacle,
    drone_height: float,
    safety_margin: float,
) -> None:
    """
    Convert one obstacle polygon into blocked grid cells.

    Steps:
    1. Check if obstacle should block for the current drone height.
    2. Convert obstacle vertices to grid cells.
    3. Build a bounding box in grid space.
    4. For each cell in that box, test whether the cell center lies inside the polygon.
    5. If yes, mark the cell as blocked.
    """
    if not obstacle.geometry or len(obstacle.geometry) < 3:
        return

    if not should_block_obstacle(obstacle, drone_height, safety_margin):
        return

    grid_points = [grid.converter.geo_to_grid(p) for p in obstacle.geometry]

    min_row = min(p.row for p in grid_points)
    max_row = max(p.row for p in grid_points)
    min_col = min(p.col for p in grid_points)
    max_col = max(p.col for p in grid_points)

    min_row = max(0, min_row)
    max_row = min(grid.rows - 1, max_row)
    min_col = max(0, min_col)
    max_col = min(grid.cols - 1, max_col)

    for row in range(min_row, max_row + 1):
        for col in range(min_col, max_col + 1):
            cell = GridPoint(row=row, col=col)
            cell_center = grid.converter.grid_to_geo_center(cell)

            if point_in_polygon(cell_center, obstacle.geometry):
                grid.set_blocked(cell)


def block_obstacles_on_grid(
    grid: PlanningGrid,
    obstacles: List[PlannerObstacle],
    drone_height: float,
    safety_margin: float,
) -> None:
    """
    Apply all blocking obstacles to the planning grid.
    """
    for obstacle in obstacles:
        block_obstacle_on_grid(
            grid=grid,
            obstacle=obstacle,
            drone_height=drone_height,
            safety_margin=safety_margin,
        )