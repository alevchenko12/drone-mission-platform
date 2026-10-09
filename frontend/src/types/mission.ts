import type {
  MultiRouteGenerateRequest,
  MultiRouteItem,
} from "./route";

export interface MissionCreate {
  name: string;
  planning_inputs: MultiRouteGenerateRequest;
  assignments: MultiRouteItem[];
}

export interface MissionSummary {
  id: string;
  name: string;
  created_at: string;
}

export interface SavedRoute extends MultiRouteItem {
  id: string;
}

export interface MissionDetail extends MissionSummary {
  planning_inputs: MultiRouteGenerateRequest;
  routes: SavedRoute[];
}