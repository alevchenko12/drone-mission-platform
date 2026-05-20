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
    safety_margin: float = Field(default=5.0, description="Safety margin in meters")

# Single‑drone request/response
class RouteGenerateRequest(BaseModel):
    start_point: Point
    goal_point: Point
    obstacles: List[Obstacle] = Field(default_factory=list)
    drone_parameters: DroneParameters = Field(default_factory=DroneParameters)

class RouteGenerateResponse(BaseModel):
    route_coordinates: List[List[float]]
    distance: float

# Multi‑drone response item and request/response
class MultiRouteItem(BaseModel):
    drone_index: int
    goal_index: int
    route_coordinates: List[List[float]]
    distance: float

class MultiRouteGenerateRequest(BaseModel):
    start_points: List[Point]
    goal_points: List[Point]
    obstacles: List[Obstacle] = Field(default_factory=list)
    drone_parameters: DroneParameters = Field(default_factory=DroneParameters)

class MultiRouteGenerateResponse(BaseModel):
    assignments: List[MultiRouteItem]