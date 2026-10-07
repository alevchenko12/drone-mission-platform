import type { Obstacle } from '../types/obstacle'
import type { MapPoint } from '../types/route'

export function createRectangleObstacle(
  startCorner: MapPoint,
  endCorner: MapPoint,
  height: number = 0,
): Obstacle {
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