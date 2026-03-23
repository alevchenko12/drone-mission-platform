const API_BASE_URL = "http://localhost:8000";

export async function fetchObstacles(bounds) {
  const params = new URLSearchParams({
    min_lat: bounds.minLat.toString(),
    min_lon: bounds.minLon.toString(),
    max_lat: bounds.maxLat.toString(),
    max_lon: bounds.maxLon.toString(),
  });

  const response = await fetch(`${API_BASE_URL}/obstacles?${params.toString()}`);

  if (!response.ok) {
    throw new Error("Failed to load obstacles.");
  }

  return response.json();
}