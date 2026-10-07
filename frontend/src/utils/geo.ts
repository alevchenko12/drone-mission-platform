import type { GeoPoint } from '../types/obstacle'

function toRadians(value: number): number {
  return (value * Math.PI) / 180
}

export function calculateDistanceMeters(
  a: GeoPoint,
  b: GeoPoint,
): number {
  const earthRadius = 6371000
  const dLat = toRadians(b.lat - a.lat)
  const dLon = toRadians(b.lon - a.lon)
  const lat1 = toRadians(a.lat)
  const lat2 = toRadians(b.lat)

  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2

  return earthRadius * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

export function calculateRouteLength(route: GeoPoint[]): number {
  let distance = 0

  for (let i = 0; i < route.length - 1; i += 1) {
    distance += calculateDistanceMeters(route[i], route[i + 1])
  }

  return distance
}

export function formatDistance(distance: number): string {
  if (!Number.isFinite(distance) || distance <= 0) return '0 m'
  if (distance >= 1000) return `${(distance / 1000).toFixed(2)} km`

  return `${Math.round(distance)} m`
}