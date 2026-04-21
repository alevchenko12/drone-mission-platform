from app.planner.models import GeoPoint, GridPoint, PlannerBounds


class CoordinateConverter:
    """
    Converts between geographic coordinates (lat/lon)
    and grid coordinates (row/col).
    """

    def __init__(self, bounds: PlannerBounds, rows: int, cols: int):
        if rows <= 0 or cols <= 0:
            raise ValueError("rows and cols must be greater than 0")

        lat_span = bounds.max_lat - bounds.min_lat
        lon_span = bounds.max_lon - bounds.min_lon

        if lat_span <= 0 or lon_span <= 0:
            raise ValueError("Invalid planner bounds")

        self.bounds = bounds
        self.rows = rows
        self.cols = cols
        self.lat_span = lat_span
        self.lon_span = lon_span
        self.cell_height = lat_span / rows
        self.cell_width = lon_span / cols

    def geo_to_grid(self, point: GeoPoint) -> GridPoint:
        """
        Convert geographic coordinate to grid cell.
        """
        row = int((self.bounds.max_lat - point.lat) / self.cell_height)
        col = int((point.lon - self.bounds.min_lon) / self.cell_width)

        row = max(0, min(self.rows - 1, row))
        col = max(0, min(self.cols - 1, col))

        return GridPoint(row=row, col=col)

    def grid_to_geo_center(self, point: GridPoint) -> GeoPoint:
        """
        Convert grid cell to the geographic center of that cell.
        """
        lat = self.bounds.max_lat - ((point.row + 0.5) * self.cell_height)
        lon = self.bounds.min_lon + ((point.col + 0.5) * self.cell_width)

        return GeoPoint(lat=lat, lon=lon)