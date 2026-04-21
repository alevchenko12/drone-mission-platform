from app.planner import (
    GeoPoint,
    GridPoint,
    PlannerObstacle,
    calculate_planner_bounds,
    PlanningGrid,
    block_obstacles_on_grid,
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

    block_obstacles_on_grid(
        grid=grid,
        obstacles=[obstacle],
        drone_height=25.0,
        safety_margin=5.0,
    )

    print("Blocked cells after obstacle mapping:")

    blocked_count = 0
    for row in range(grid.rows):
        for col in range(grid.cols):
            if grid.is_blocked(GridPoint(row, col)):
                blocked_count += 1

    print("Blocked cell count:", blocked_count)

    obstacle_test_cell = grid.converter.geo_to_grid(GeoPoint(lat=54.6881, lon=25.28065))
    print("Obstacle center cell:", obstacle_test_cell)
    print("Obstacle center blocked:", grid.is_blocked(obstacle_test_cell))


if __name__ == "__main__":
    main()