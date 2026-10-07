import type { Obstacle } from '../types/obstacle'
import type { RouteObstacle } from '../types/route'

function getObstacleHeight(obstacle: Obstacle): number {
  const height = Number(obstacle.height || 0)

  if (height > 0) return height
  if (obstacle.type === 'building') return 20

  return 15
}

export function normalizeObstacle(obstacle: Obstacle): RouteObstacle {
  return {
    id: obstacle.id || null,
    source: obstacle.source || 'user',
    type: obstacle.type || 'restricted_zone',
    height: getObstacleHeight(obstacle),
    geometry: obstacle.geometry.map((point) => [
      point.lat,
      point.lon,
    ]),
  }
}