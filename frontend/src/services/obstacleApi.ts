import type {
  MapBounds,
  ObstacleListResponse,
} from "../types/obstacle";

const API_BASE_URL = "http://localhost:8000";

export async function fetchObstacles(
  bounds: MapBounds,
): Promise<ObstacleListResponse> {
  const params = new URLSearchParams({
    min_lat: bounds.minLat.toString(),
    min_lon: bounds.minLon.toString(),
    max_lat: bounds.maxLat.toString(),
    max_lon: bounds.maxLon.toString(),
  });

  const response = await fetch(`${API_BASE_URL}/obstacles?${params}`);

  if (!response.ok) {
    let message = "Failed to load obstacles.";

    try {
      const errorData: unknown = await response.json();

      if (
        typeof errorData === "object" &&
        errorData !== null &&
        "detail" in errorData &&
        typeof errorData.detail === "string"
      ) {
        message = errorData.detail;
      }
    } catch {
      // Keep the fallback message if the response is not valid JSON.
    }

    throw new Error(message);
  }

  const data: ObstacleListResponse = await response.json();
  return data;
}