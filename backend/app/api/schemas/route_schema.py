from pydantic import BaseModel
from typing import List


class Point(BaseModel):
    lat: float
    lon: float


class RouteGenerateRequest(BaseModel):
    start_point: Point
    goal_point: Point
    obstacles: list = []
    drone_parameters: dict = {}


class RouteGenerateResponse(BaseModel):
    route_coordinates: List[List[float]]
    distance: float | None = None