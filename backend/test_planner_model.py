from app.planner import (
    GeoPoint,
    PlannerObstacle,
    calculate_planner_bounds,
    PlanningGrid,
    block_obstacles_on_grid,
    astar_search,
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

    grid = PlanningGrid(bounds=bounds, rows=30, cols=30)

    block_obstacles_on_grid(
        grid=grid,
        obstacles=[obstacle],
        drone_height=10.0,
        safety_margin=5.0,
    )

    start_grid = grid.converter.geo_to_grid(start)
    goal_grid = grid.converter.geo_to_grid(goal)

    print("Start grid:", start_grid)
    print("Goal grid:", goal_grid)

    path = astar_search(grid, start_grid, goal_grid)

    if path is None:
        print("No path found.")
        return

    print("Path found.")
    print("Path length:", len(path))
    print("First node:", path[0])
    print("Last node:", path[-1])

    geo_path = [grid.converter.grid_to_geo_center(p) for p in path]
    print("First geo point:", geo_path[0])
    print("Last geo point:", geo_path[-1])


if __name__ == "__main__":
    main()