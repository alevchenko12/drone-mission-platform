from pydantic import BaseModel, Field
from typing import List


class Point(BaseModel):
    lat: float = Field(..., description="Latitude")
    lon: float = Field(..., description="Longitude")


class Obstacle(BaseModel):
    id: str | None = None
    source: str | None = None
    type: str | None = None
    geometry: List[List[float]] = Field(default_factory=list)
    height: float | None = None


class DroneParameters(BaseModel):
    height: float = Field(default=50.0, description="Drone altitude in meters")


class RouteGenerateRequest(BaseModel):
    start_point: Point
    goal_point: Point
    obstacles: List[Obstacle] = Field(default_factory=list)
    drone_parameters: DroneParameters = Field(default_factory=DroneParameters)


class RouteGenerateResponse(BaseModel):
    route_coordinates: List[List[float]]
    distance: float