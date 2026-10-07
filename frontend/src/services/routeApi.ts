import type {
  MapPoint,
  RouteObstacleInput,
  RouteObstacle,
  RouteGenerateRequest,
  RouteGenerateResponse,
} from "../types/route";

import axios from "axios";
import type {
  MultiRouteGenerateRequest,
  MultiRouteGenerateResponse,
} from "../types/route";  

const API_BASE_URL = "http://localhost:8000";

function normalizeObstacleForRoute(
  obstacle: RouteObstacleInput,
): RouteObstacle {
  return {
    id: obstacle.id,
    source: obstacle.source,
    type: obstacle.type,
    geometry: (obstacle.geometry ?? []).map((point) => [
      point.lat,
      "lon" in point ? point.lon : point.lng,
    ]),
    height: obstacle.height ?? 0,
  };
}

export async function generateRoute(
  startPoint: MapPoint,
  goalPoint: MapPoint,
  obstacles: RouteObstacleInput[] = [],
): Promise<RouteGenerateResponse> {
  const payload: RouteGenerateRequest = {
    start_point: {
      lat: startPoint.lat,
      lon: startPoint.lng,
    },
    goal_point: {
      lat: goalPoint.lat,
      lon: goalPoint.lng,
    },
    obstacles: obstacles.map(normalizeObstacleForRoute),
    drone_parameters: {
      height: 18,
      safety_margin: 5,
    },
  };

  const response = await fetch(`${API_BASE_URL}/route/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let message = "Failed to generate route.";

    try {
      const errorData: unknown = await response.json();

      if (
        typeof errorData === "object" &&
        errorData !== null &&
        "detail" in errorData &&
        errorData.detail != null
      ) {
        message =
          typeof errorData.detail === "string"
            ? errorData.detail
            : JSON.stringify(errorData.detail) ?? message;
      }
    } catch {
      // Keep the fallback message if the response cannot be parsed.
    }

    throw new Error(message);
  }

  const data: RouteGenerateResponse = await response.json();
  return data;
}

export async function generateMultiRoutes(
  payload: MultiRouteGenerateRequest,
): Promise<MultiRouteGenerateResponse> {
  const response = await axios.post<MultiRouteGenerateResponse>(
    `${API_BASE_URL}/route/generate-multi`,
    payload,
  );

  return response.data;
}