import type { GeoPoint } from './obstacle'

export type MissionState =
  | 'idle'
  | 'running'
  | 'paused'
  | 'completed'
  | 'landed'

export type DroneState = 'flying' | 'completed' | 'landed'

export interface DroneSimulationState {
  id: number;
  goalIndex: number;
  route: GeoPoint[];
  totalDistance: number;
  distanceTraveled: number;
  currentSegmentIndex: number;
  segmentDistance: number;
  position: GeoPoint;
  altitude: number;
  state: DroneState;
}