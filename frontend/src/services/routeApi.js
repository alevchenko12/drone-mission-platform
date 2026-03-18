const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

export async function generateRoute(startPoint, goalPoint) {
  const response = await fetch(`${API_BASE_URL}/route/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
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
      obstacles: [],
      drone_parameters: {
        height: 50,
      },
    }),
  })

  if (!response.ok) {
    throw new Error('Failed to generate route')
  }

  return response.json()
}