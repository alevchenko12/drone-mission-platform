const API_BASE_URL = "http://localhost:8000";

export async function generateRoute(startPoint, goalPoint, obstacles = []) {
  const response = await fetch(`${API_BASE_URL}/route/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      start_point: {
        lat: startPoint.lat,
        lon: startPoint.lng,
      },
      goal_point: {
        lat: goalPoint.lat,
        lon: goalPoint.lng,
      },
      obstacles: obstacles,
      drone_parameters: {
        height: 10,
      },
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to generate route.");
  }

  return response.json();
}