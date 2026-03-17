from math import sqrt


def generate_mock_route(start_point, goal_point):
    return [
        [start_point.lat, start_point.lon],
        [goal_point.lat, goal_point.lon]
    ]


def calculate_mock_distance(start_point, goal_point):
    lat_diff = goal_point.lat - start_point.lat
    lon_diff = goal_point.lon - start_point.lon
    return sqrt(lat_diff ** 2 + lon_diff ** 2)