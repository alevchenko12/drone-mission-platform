from typing import List
from app.planner.models import GridPoint, PlannerBounds
from app.planner.converter import CoordinateConverter


FREE = 0
BLOCKED = 1


class PlanningGrid:
    """
    Internal 2D grid used for route planning.
    Each cell is either FREE or BLOCKED.
    """

    def __init__(self, bounds: PlannerBounds, rows: int, cols: int):
        if rows <= 0 or cols <= 0:
            raise ValueError("rows and cols must be greater than 0")

        self.bounds = bounds
        self.rows = rows
        self.cols = cols
        self.cells: List[List[int]] = [
            [FREE for _ in range(cols)] for _ in range(rows)
        ]
        self.converter = CoordinateConverter(bounds=bounds, rows=rows, cols=cols)

    def is_within_bounds(self, point: GridPoint) -> bool:
        return 0 <= point.row < self.rows and 0 <= point.col < self.cols

    def is_blocked(self, point: GridPoint) -> bool:
        if not self.is_within_bounds(point):
            return True
        return self.cells[point.row][point.col] == BLOCKED

    def is_free(self, point: GridPoint) -> bool:
        return not self.is_blocked(point)

    def set_blocked(self, point: GridPoint) -> None:
        if self.is_within_bounds(point):
            self.cells[point.row][point.col] = BLOCKED

    def set_free(self, point: GridPoint) -> None:
        if self.is_within_bounds(point):
            self.cells[point.row][point.col] = FREE

    def block_rectangle(
        self,
        min_row: int,
        min_col: int,
        max_row: int,
        max_col: int,
    ) -> None:
        """
        Simple helper for testing.
        """
        for row in range(min_row, max_row + 1):
            for col in range(min_col, max_col + 1):
                self.set_blocked(GridPoint(row=row, col=col))