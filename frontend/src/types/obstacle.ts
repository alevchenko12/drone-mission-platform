export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface Obstacle {
  id: string;
  source: "osm" | "manual";
  type: "building" | "zone";
  geometry: GeoPoint[];
  height: number | null;
}

export interface ObstacleListResponse {
  obstacles: Obstacle[];
  count: number;
  source_status: string;
  cached: boolean;
}

export interface MapBounds {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}