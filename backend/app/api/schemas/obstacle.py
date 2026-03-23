from pydantic import BaseModel, Field
from typing import List, Literal, Optional


class PointSchema(BaseModel):
    lat: float
    lon: float


class ObstacleSchema(BaseModel):
    id: str
    source: Literal["osm", "manual"] = "osm"
    type: Literal["building", "zone"] = "building"
    geometry: List[PointSchema] = Field(default_factory=list)
    height: Optional[float] = 0.0


class ObstacleListResponse(BaseModel):
    obstacles: List[ObstacleSchema] = Field(default_factory=list)
    count: int = 0