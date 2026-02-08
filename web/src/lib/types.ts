/**
 * NFL Coaching Tree — Type Definitions & Layout Constants
 */

// ── Raw data types (from coaching_connections.json) ──

export interface Coach {
  id: string;
  name: string;
  current_team: string | null;
  is_current_hc: boolean;
}

export interface Connection {
  source: string;
  target: string;
  type: "coaching_tree" | "career_overlap";
  years?: string;
  context?: string;
}

export interface RawData {
  coaches: Coach[];
  connections: Connection[];
  team_colors: Record<string, string>;
}

// ── Processed types ──

export interface CoachNode extends Coach {
  layer: number;
  x: number;
  y: number;
}

export interface ProcessedData {
  nodes: CoachNode[];
  nodeMap: Map<string, CoachNode>;
  /** Coaching-tree-only edges (for rendering + sidebar) */
  edges: Connection[];
  /** All pruned connections including career_overlap (kept for reference) */
  allEdges: Connection[];
  teamColors: Record<string, string>;
  maxLayer: number;
  /** Mentor adjacency: coachId → [mentorIds in tree] */
  mAdj: Map<string, string[]>;
  /** Protege adjacency: coachId → [protegeIds in tree] */
  pAdj: Map<string, string[]>;
  /** Total canvas width */
  W: number;
  /** Total canvas height */
  H: number;
  /** Layer groups for rendering bands */
  layers: CoachNode[][];
}

// ── Layout Constants ──

export const CARD_W = 150;
export const CARD_H = 46;
export const GAP = 14;
export const LAYER_SP = 120;
export const PAD = { top: 70, bot: 50, side: 100 };
export const MAX_LAYER = 5;

export const LAYER_LABELS = [
  "Current Head Coaches",
  "Direct Mentors",
  "2nd Generation",
  "3rd Generation",
  "4th Generation",
  "5th Generation",
  "6th Generation",
  "7th Generation",
  "8th Generation",
  "9th Generation",
];
