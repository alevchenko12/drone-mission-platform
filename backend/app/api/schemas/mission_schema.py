from datetime import datetime
from math import isfinite
from typing import Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.api.schemas.route_schema import (
    MultiRouteGenerateRequest,
    MultiRouteItem,
)


class SavedRouteInput(MultiRouteItem):
    drone_index: int = Field(ge=0)
    goal_index: int = Field(ge=0)
    distance: float = Field(ge=0, allow_inf_nan=False)
    route_coordinates: list[tuple[float, float]] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_coordinates(self) -> Self:
        for lat, lon in self.route_coordinates:
            if not isfinite(lat) or not -90 <= lat <= 90:
                raise ValueError("Route latitude must be between -90 and 90.")

            if not isfinite(lon) or not -180 <= lon <= 180:
                raise ValueError("Route longitude must be between -180 and 180.")

        return self


class MissionCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    name: str = Field(min_length=1, max_length=120)
    planning_inputs: MultiRouteGenerateRequest
    assignments: list[SavedRouteInput] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_assignments(self) -> Self:
        drone_count = len(self.planning_inputs.start_points)
        goal_count = len(self.planning_inputs.goal_points)

        if drone_count == 0 or drone_count != goal_count:
            raise ValueError(
                "A mission needs an equal, nonzero number of drones and goals."
            )

        if len(self.assignments) != drone_count:
            raise ValueError("Each drone must have one route.")

        drone_indices = {route.drone_index for route in self.assignments}
        goal_indices = {route.goal_index for route in self.assignments}

        if drone_indices != set(range(drone_count)):
            raise ValueError("Drone assignments must be unique and in range.")

        if goal_indices != set(range(goal_count)):
            raise ValueError("Goal assignments must be unique and in range.")

        return self


class MissionSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    created_at: datetime


class SavedRouteResponse(SavedRouteInput):
    model_config = ConfigDict(from_attributes=True)

    id: UUID


class MissionDetail(MissionSummary):
    planning_inputs: MultiRouteGenerateRequest
    routes: list[SavedRouteResponse]