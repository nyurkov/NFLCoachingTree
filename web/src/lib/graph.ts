/**
 * NFL Coaching Tree — Pure Graph Functions
 *
 * All layout and graph logic extracted from tree.js.
 * No DOM, no D3, no side effects — pure functions + processData orchestrator.
 */
import {
  Coach,
  CoachNode,
  Connection,
  ProcessedData,
  RawData,
  CARD_W,
  CARD_H,
  GAP,
  LAYER_SP,
  PAD,
  MAX_LAYER,
} from "./types";

// ── Helpers ──

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ── Adjacency ──

export interface Adjacency {
  mentorsOf: Map<string, string[]>;
  protegesOf: Map<string, string[]>;
}

export function buildAdjacency(connections: Connection[]): Adjacency {
  const mentorsOf = new Map<string, string[]>();
  const protegesOf = new Map<string, string[]>();

  for (const c of connections) {
    if (c.type !== "coaching_tree") continue;
    if (!mentorsOf.has(c.target)) mentorsOf.set(c.target, []);
    mentorsOf.get(c.target)!.push(c.source);
    if (!protegesOf.has(c.source)) protegesOf.set(c.source, []);
    protegesOf.get(c.source)!.push(c.target);
  }

  return { mentorsOf, protegesOf };
}

// ── BFS from HCs upward ──

export function bfsFromHCs(
  currentHCs: Coach[],
  mentorsOf: Map<string, string[]>
): Map<string, number> {
  const layerOf = new Map<string, number>();
  for (const hc of currentHCs) layerOf.set(hc.id, 0);

  const bfsQ = currentHCs.map((hc) => hc.id);
  let qi = 0;
  while (qi < bfsQ.length) {
    const id = bfsQ[qi++];
    for (const mentorId of mentorsOf.get(id) || []) {
      if (!layerOf.has(mentorId)) {
        layerOf.set(mentorId, 0);
        bfsQ.push(mentorId);
      }
    }
  }

  return layerOf;
}

// ── Longest-path layer assignment ──

export function assignLayers(
  layerOf: Map<string, number>,
  connections: Connection[],
  coachById: Map<string, Coach>
): Map<string, number> {
  let changed = true;
  while (changed) {
    changed = false;
    for (const c of connections) {
      if (c.type !== "coaching_tree") continue;
      if (!layerOf.has(c.source) || !layerOf.has(c.target)) continue;
      const srcCoach = coachById.get(c.source);
      if (srcCoach && srcCoach.is_current_hc) continue;
      const protegeLayer = layerOf.get(c.target)!;
      const newLayer = Math.min(protegeLayer + 1, MAX_LAYER);
      if (newLayer > layerOf.get(c.source)!) {
        layerOf.set(c.source, newLayer);
        changed = true;
      }
    }
  }
  return layerOf;
}

// ── Crossing minimization (barycenter heuristic) ──

export function minimizeCrossings(
  layers: CoachNode[][],
  maxLayer: number,
  pAdj: Map<string, string[]>,
  mAdj: Map<string, string[]>,
  nodeMap: Map<string, CoachNode>
): CoachNode[][] {
  const orderOf = new Map<string, number>();
  for (const layer of layers) {
    layer.forEach((n, i) => orderOf.set(n.id, i));
  }

  for (let pass = 0; pass < 24; pass++) {
    // Up sweep
    for (let l = 1; l <= maxLayer; l++) {
      for (const n of layers[l]) {
        const kids = (pAdj.get(n.id) || []).filter((id) => nodeMap.has(id));
        if (kids.length) {
          const avg =
            kids.reduce((s, id) => s + (orderOf.get(id) || 0), 0) /
            kids.length;
          orderOf.set(n.id, avg);
        }
      }
      layers[l].sort(
        (a, b) => (orderOf.get(a.id) || 0) - (orderOf.get(b.id) || 0)
      );
      layers[l].forEach((n, i) => orderOf.set(n.id, i));
    }
    // Down sweep
    for (let l = maxLayer - 1; l >= 0; l--) {
      for (const n of layers[l]) {
        const parents = (mAdj.get(n.id) || []).filter((id) => nodeMap.has(id));
        if (parents.length) {
          const avg =
            parents.reduce((s, id) => s + (orderOf.get(id) || 0), 0) /
            parents.length;
          orderOf.set(n.id, avg);
        }
      }
      layers[l].sort(
        (a, b) => (orderOf.get(a.id) || 0) - (orderOf.get(b.id) || 0)
      );
      layers[l].forEach((n, i) => orderOf.set(n.id, i));
    }
  }

  return layers;
}

// ── Pixel positions ──

export function computePositions(
  layers: CoachNode[][],
  maxLayer: number,
  W: number
): void {
  for (let l = 0; l <= maxLayer; l++) {
    const arr = layers[l];
    const n = arr.length;
    const totalW = n * CARD_W + (n - 1) * GAP;
    const startX = (W - totalW) / 2;
    const y = PAD.top + (maxLayer - l) * LAYER_SP;

    arr.forEach((node, j) => {
      node.x = startX + j * (CARD_W + GAP) + CARD_W / 2;
      node.y = y;
    });
  }
}

// ── DFS deepest ancestor path ──

export function getDeepestPath(
  startId: string,
  mAdj: Map<string, string[]>,
  nodeMap: Map<string, CoachNode>
): Set<string> {
  let bestPath = [startId];

  function dfs(nodeId: string, path: string[]) {
    const mentors = (mAdj.get(nodeId) || []).filter((id) => nodeMap.has(id));
    if (mentors.length === 0) {
      if (path.length > bestPath.length) bestPath = [...path];
      return;
    }
    for (const m of mentors) {
      if (!path.includes(m)) {
        path.push(m);
        dfs(m, path);
        path.pop();
      }
    }
  }

  dfs(startId, [startId]);
  return new Set(bestPath);
}

// ── Path edges ──

export function getPathEdges(
  pathSet: Set<string>,
  edges: Connection[],
  mAdj: Map<string, string[]>
): Set<Connection> {
  const pathEdges = new Set<Connection>();
  for (const e of edges) {
    if (pathSet.has(e.source) && pathSet.has(e.target)) {
      const mentors = mAdj.get(e.target) || [];
      if (mentors.includes(e.source)) pathEdges.add(e);
    }
  }
  return pathEdges;
}

// ── Full tree (ancestors + descendants) ──

export function getFullTree(
  startId: string,
  mAdj: Map<string, string[]>,
  pAdj: Map<string, string[]>,
  nodeMap: Map<string, CoachNode>
): Set<string> {
  const visited = new Set([startId]);

  // BFS upward through mentors
  const q = [startId];
  let i = 0;
  while (i < q.length) {
    const curr = q[i++];
    for (const m of mAdj.get(curr) || []) {
      if (!visited.has(m) && nodeMap.has(m)) {
        visited.add(m);
        q.push(m);
      }
    }
  }

  // BFS downward through proteges
  const q2 = [startId];
  i = 0;
  while (i < q2.length) {
    const curr = q2[i++];
    for (const p of pAdj.get(curr) || []) {
      if (!visited.has(p) && nodeMap.has(p)) {
        visited.add(p);
        q2.push(p);
      }
    }
  }

  return visited;
}

// ── SVG edge path builder ──

export function buildEdgePath(
  d: Connection,
  nodeMap: Map<string, CoachNode>
): string {
  const sNode = nodeMap.get(d.source);
  const tNode = nodeMap.get(d.target);
  if (!sNode || !tNode) return "";

  const halfH = CARD_H / 2;

  // Same layer — arc above
  if (sNode.layer === tNode.layer) {
    const x1 = sNode.x,
      y1 = sNode.y - halfH;
    const x2 = tNode.x,
      y2 = tNode.y - halfH;
    const arc = 35 + Math.abs(x2 - x1) * 0.08;
    return `M${x1},${y1} C${x1},${y1 - arc} ${x2},${y2 - arc} ${x2},${y2}`;
  }

  // Normal: higher layer = lower Y (mentors are above)
  let top = sNode,
    bot = tNode;
  if (sNode.y > tNode.y) {
    top = tNode;
    bot = sNode;
  }

  const x1 = top.x,
    y1 = top.y + halfH;
  const x2 = bot.x,
    y2 = bot.y - halfH;
  const mid = (y1 + y2) / 2;
  return `M${x1},${y1} C${x1},${mid} ${x2},${mid} ${x2},${y2}`;
}

// ── Main data processing orchestrator ──

export function processData(raw: RawData): ProcessedData {
  const { coaches: allCoaches, connections: allConns, team_colors } = raw;
  const teamColors = team_colors || {};
  const coachById = new Map(allCoaches.map((c) => [c.id, c]));

  // Build adjacency from ALL connections
  const { mentorsOf, protegesOf } = buildAdjacency(allConns);

  // BFS from current HCs
  const currentHCs = allCoaches.filter((c) => c.is_current_hc);
  const layerOf = bfsFromHCs(currentHCs, mentorsOf);

  // Assign layers via longest-path
  assignLayers(layerOf, allConns, coachById);

  // Prune — keep only discovered nodes
  const kept = new Set(layerOf.keys());

  const nodes: CoachNode[] = allCoaches
    .filter((c) => kept.has(c.id))
    .map((c) => ({
      ...c,
      layer: layerOf.get(c.id)!,
      x: 0,
      y: 0,
    }));

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Edges for tree rendering (coaching_tree only, both endpoints pruned)
  const edges = allConns.filter(
    (c) =>
      c.type === "coaching_tree" && kept.has(c.source) && kept.has(c.target)
  );

  // All pruned connections (including career_overlap) for reference
  const allEdges = allConns.filter(
    (c) => kept.has(c.source) && kept.has(c.target)
  );

  const maxLayer = Math.max(0, ...nodes.map((n) => n.layer));

  // Group by layer
  const layers: CoachNode[][] = Array.from(
    { length: maxLayer + 1 },
    () => []
  );
  for (const n of nodes) layers[n.layer].push(n);

  // Initial alphabetical sort
  for (const layer of layers)
    layer.sort((a, b) => a.name.localeCompare(b.name));

  // Build pruned adjacency for crossing minimization
  const mAdj = new Map<string, string[]>();
  const pAdj = new Map<string, string[]>();
  for (const e of edges) {
    if (!pAdj.has(e.source)) pAdj.set(e.source, []);
    pAdj.get(e.source)!.push(e.target);
    if (!mAdj.has(e.target)) mAdj.set(e.target, []);
    mAdj.get(e.target)!.push(e.source);
  }

  // Minimize crossings
  minimizeCrossings(layers, maxLayer, pAdj, mAdj, nodeMap);

  // Compute canvas size
  const maxCount = Math.max(...layers.map((l) => l.length));
  const W = maxCount * CARD_W + (maxCount - 1) * GAP + 2 * PAD.side;
  const H = (maxLayer + 1) * LAYER_SP + PAD.top + PAD.bot;

  // Compute positions
  computePositions(layers, maxLayer, W);

  return {
    nodes,
    nodeMap,
    edges,
    allEdges,
    teamColors,
    maxLayer,
    mAdj,
    pAdj,
    W,
    H,
    layers,
  };
}
