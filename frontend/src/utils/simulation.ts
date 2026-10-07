import type { MultiRouteItem } from '../types/route'
import type { DroneSimulationState } from '../types/simulation'
import { calculateRouteLength } from './geo'
import { calculateDistanceMeters } from './geo'

export function createSimulationStates(
  assignments: MultiRouteItem[],
): DroneSimulationState[] {
  return assignments.map((assignment) => {
    const route = assignment.route_coordinates.map(([lat, lon]) => ({
      lat,
      lon,
    }))

    const startPosition = route[0]

    if (!startPosition) {
      throw new Error(
        `Drone ${assignment.drone_index + 1} has an empty route.`,
      )
    }

    return {
      id: assignment.drone_index,
      goalIndex: assignment.goal_index,
      route,
      totalDistance: calculateRouteLength(route),
      distanceTraveled: 0,
      currentSegmentIndex: 0,
      segmentDistance: 0,
      position: startPosition,
      altitude: 0,
      state: 'flying',
    }
  })
}

export function advanceDrone(
  drone: DroneSimulationState,
  speedMps: number,
  intervalMs: number,
  targetAltitude: number,
): DroneSimulationState {
  if (drone.state === 'completed' || drone.state === 'landed') {
    return drone
  }

  const route = drone.route
  const finalPosition = route[route.length - 1]

  if (!finalPosition) {
    throw new Error(`Drone ${drone.id + 1} has an empty route.`)
  }

  function complete(): DroneSimulationState {
    return {
      ...drone,
      currentSegmentIndex: route.length - 1,
      segmentDistance: 0,
      distanceTraveled: drone.totalDistance,
      position: finalPosition,
      altitude: 0,
      state: 'completed',
    }
  }

  if (drone.currentSegmentIndex >= route.length - 1) {
    return complete()
  }

  let remainingMove = (speedMps * intervalMs) / 1000
  let segmentIndex = drone.currentSegmentIndex
  let segmentDistance = drone.segmentDistance
  let distanceTraveled = drone.distanceTraveled

  while (remainingMove > 0 && segmentIndex < route.length - 1) {
    const start = route[segmentIndex]
    const end = route[segmentIndex + 1]
    const segmentLength = calculateDistanceMeters(start, end)
    const remainingSegment = Math.max(0, segmentLength - segmentDistance)

    if (remainingMove >= remainingSegment) {
      remainingMove -= remainingSegment
      distanceTraveled += remainingSegment
      segmentIndex += 1
      segmentDistance = 0
    } else {
      segmentDistance += remainingMove
      distanceTraveled += remainingMove
      remainingMove = 0
    }
  }

  if (segmentIndex >= route.length - 1) {
    return complete()
  }

  const start = route[segmentIndex]
  const end = route[segmentIndex + 1]
  const segmentLength = calculateDistanceMeters(start, end)
  const ratio = segmentLength > 0 ? segmentDistance / segmentLength : 1

  return {
    ...drone,
    currentSegmentIndex: segmentIndex,
    segmentDistance,
    distanceTraveled,
    position: {
      lat: start.lat + (end.lat - start.lat) * ratio,
      lon: start.lon + (end.lon - start.lon) * ratio,
    },
    altitude: Math.min(
      targetAltitude,
      drone.altitude + (targetAltitude / 10) * (intervalMs / 1000),
    ),
    state: 'flying',
  }
}