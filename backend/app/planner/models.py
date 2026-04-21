from dataclasses import dataclass
from typing import List, Optional


@dataclass(frozen=True)
class GeoPoint:
    lat: float
    lon: float


@dataclass(frozen=True)
class GridPoint:
    row: int
    col: int


@dataclass
class PlannerBounds:
    min_lat: float
    min_lon: float
    max_lat: float
    max_lon: float


@dataclass
class PlannerObstacle:
    id: str
    source: str
    type: str
    geometry: List[GeoPoint]
    height: Optional[float] = 0.0