from app.planner import (
    GeoPoint,
    GridPoint,
    PlannerObstacle,
    calculate_planner_bounds,
    PlanningGrid,
)


def main():
    start = GeoPoint(lat=54.6872, lon=25.2797)
    goal = GeoPoint(lat=54.6890, lon=25.2820)

    obstacle = PlannerObstacle(
        id="obs-1",
        source="map",
        type="building",
        geometry=[
            GeoPoint(lat=54.6880, lon=25.2805),
            GeoPoint(lat=54.6882, lon=25.2805),
            GeoPoint(lat=54.6882, lon=25.2808),
            GeoPoint(lat=54.6880, lon=25.2808),
        ],
        height=15.0,
    )

    bounds = calculate_planner_bounds(start, goal, [obstacle])
    print("Bounds:", bounds)

    grid = PlanningGrid(bounds=bounds, rows=20, cols=20)

    start_grid = grid.converter.geo_to_grid(start)
    goal_grid = grid.converter.geo_to_grid(goal)

    print("Start grid:", start_grid)
    print("Goal grid:", goal_grid)

    start_geo_back = grid.converter.grid_to_geo_center(start_grid)
    print("Start back to geo center:", start_geo_back)

    grid.block_rectangle(5, 5, 8, 8)
    print("Cell (6,6) blocked:", grid.is_blocked(GridPoint(6, 6)))
    print("Cell (1,1) blocked:", grid.is_blocked(GridPoint(1, 1)))


if __name__ == "__main__":
    main()