const API_BASE_URL = "http://localhost:8000";

function normalizeObstacleForRoute(obstacle) {
  return {
    id: obstacle.id,
    source: obstacle.source,
    type: obstacle.type,
    geometry: (obstacle.geometry || []).map((point) => [
      point.lat,
      point.lon ?? point.lng,
    ]),
    height: obstacle.height ?? 0,
  };
}

export async function generateRoute(startPoint, goalPoint, obstacles = []) {
  const payload = {
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
      height: 10,
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
      const errorData = await response.json();
      if (errorData.detail) {
        message =
          typeof errorData.detail === "string"
            ? errorData.detail
            : JSON.stringify(errorData.detail);
      }
    } catch {
    }

    throw new Error(message);
  }

  return response.json();
}