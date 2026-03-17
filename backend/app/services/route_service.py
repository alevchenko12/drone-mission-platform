def generate_mock_route(start_point, goal_point):
    return [
        [start_point.lat, start_point.lon],
        [goal_point.lat, goal_point.lon]
    ]