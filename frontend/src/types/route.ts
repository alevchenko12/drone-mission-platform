import type { GeoPoint } from "./obstacle";

export interface MapPoint {
  lat: number;
  lng: number;
}

// Existing obstacle geometry can use either coordinate naming style.
export interface RouteObstacleInput {
  id?: string | null;
  source?: string | null;
  type?: string | null;
  geometry?: Array<GeoPoint | MapPoint>;
  height?: number | null;
}

export interface RouteObstacle {
  id?: string | null;
  source?: string | null;
  type?: string | null;
  geometry: number[][];
  height: number | null;
}

export interface DroneParameters {
  height: number;
  safety_margin: number;
}

export interface RouteGenerateRequest {
  start_point: GeoPoint;
  goal_point: GeoPoint;
  obstacles: RouteObstacle[];
  drone_parameters: DroneParameters;
}

export interface RouteGenerateResponse {
  route_coordinates: number[][];
  distance: number;
}

export interface MultiRouteGenerateRequest {
  start_points: GeoPoint[];
  goal_points: GeoPoint[];
  obstacles: RouteObstacle[];
  drone_parameters: DroneParameters;
}

export interface MultiRouteItem {
  drone_index: number;
  goal_index: number;
  route_coordinates: number[][];
  distance: number;
}

export interface MultiRouteGenerateResponse {
  assignments: MultiRouteItem[];
}