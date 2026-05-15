export function createRectangleObstacle(startCorner, endCorner, height = 0) {
  const minLat = Math.min(startCorner.lat, endCorner.lat)
  const maxLat = Math.max(startCorner.lat, endCorner.lat)
  const minLon = Math.min(startCorner.lng, endCorner.lng)
  const maxLon = Math.max(startCorner.lng, endCorner.lng)

  return {
    id: `manual-${Date.now()}`,
    source: 'manual',
    type: 'zone',
    geometry: [
      { lat: minLat, lon: minLon },
      { lat: minLat, lon: maxLon },
      { lat: maxLat, lon: maxLon },
      { lat: maxLat, lon: minLon },
    ],
    height,
  }
}