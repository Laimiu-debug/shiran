export type UnitLevel = "S级" | "A级" | "B级";

export type UnitStatus = "draft" | "review" | "published" | "archived" | "待开发";

export interface ExploreUnit {
  id: string;
  slug: string;
  title: string;
  summary: string;
  scene: string;
  mechanisms: string[];
  category_legacy: string;
  level: UnitLevel;
  duration_min: number;
  status: UnitStatus;
  source_seq?: number;
  simulation_type?: string;
}

export interface ModelEntry {
  content: string;
  simulation?: string;
}

export interface ClusterProfile {
  seed_pattern: "stable" | "oscillator" | "random";
  seed_weight?: number;
}

export interface ModelManifest extends ExploreUnit {
  entry: ModelEntry;
  cluster_profile?: ClusterProfile;
  source?: {
    seq?: number;
    markdown?: string;
  };
}

export interface ModelIndex {
  version: string;
  generated_at: string;
  total: number;
  items: ModelManifest[];
}

export interface HomeCell {
  x: number;
  y: number;
}

export interface HomeCellCluster {
  cluster_id: string;
  unit_id: string;
  scene: string;
  mechanisms: string[];
  cells: HomeCell[];
  alive_ratio: number;
}

export interface HomeSeedState {
  seed_date: string; // YYYY-MM-DD, UTC+8 boundary
  seed_value: string;
  grid_size: {
    width: number;
    height: number;
  };
  initial_density: number;
  s_ratio: number;
  a_ratio: number;
  b_ratio: number;
}

export interface EventPayload {
  event_name:
    | "home_enter"
    | "canvas_pause_toggle"
    | "canvas_speed_change"
    | "cell_click"
    | "open_overview"
    | "search_submit"
    | "jump_to_unit";
  session_id: string;
  user_id?: string;
  unit_id?: string;
  ts: string; // ISO-8601 datetime
  properties: Record<string, string | number | boolean | null>;
}

export interface TaxonomyNode {
  id: string;
  name: string;
  description?: string;
}

export interface TaxonomyPayload {
  scenes: TaxonomyNode[];
  mechanisms: TaxonomyNode[];
}
