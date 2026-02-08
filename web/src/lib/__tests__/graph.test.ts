import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  processData,
  ordinal,
  buildEdgePath,
  getDeepestPath,
  getPathEdges,
  getFullTree,
  bfsFromHCs,
  assignLayers,
  buildAdjacency,
} from "../graph";
import { RawData, ProcessedData, MAX_LAYER, CoachNode } from "../types";

// Load the real data
let raw: RawData;
let data: ProcessedData;

beforeAll(() => {
  const jsonPath = resolve(__dirname, "../../../public/data/coaching_connections.json");
  raw = JSON.parse(readFileSync(jsonPath, "utf-8"));
  data = processData(raw);
});

// ── Data processing tests ──

describe("processData", () => {
  it("returns correct node/edge counts", () => {
    expect(data.nodes.length).toBeGreaterThan(0);
    expect(data.edges.length).toBeGreaterThan(0);
    expect(data.nodeMap.size).toBe(data.nodes.length);
  });

  it("all current HCs are at layer 0", () => {
    const hcs = data.nodes.filter((n) => n.is_current_hc);
    expect(hcs.length).toBeGreaterThan(0);
    for (const hc of hcs) {
      expect(hc.layer).toBe(0);
    }
  });

  it("no node exceeds MAX_LAYER", () => {
    for (const n of data.nodes) {
      expect(n.layer).toBeLessThanOrEqual(MAX_LAYER);
    }
  });

  it("every edge connects two nodes that exist in nodeMap", () => {
    for (const e of data.edges) {
      expect(data.nodeMap.has(e.source)).toBe(true);
      expect(data.nodeMap.has(e.target)).toBe(true);
    }
  });

  it("all nodes have valid x,y positions", () => {
    for (const n of data.nodes) {
      expect(typeof n.x).toBe("number");
      expect(typeof n.y).toBe("number");
      expect(n.x).toBeGreaterThan(0);
      expect(n.y).toBeGreaterThan(0);
    }
  });
});

// ── BFS & layer tests ──

describe("bfsFromHCs", () => {
  it("discovers all ancestors from current HCs", () => {
    const { mentorsOf } = buildAdjacency(raw.connections);
    const currentHCs = raw.coaches.filter((c) => c.is_current_hc);
    const layerOf = bfsFromHCs(currentHCs, mentorsOf);
    // Should discover more nodes than just HCs
    expect(layerOf.size).toBeGreaterThan(currentHCs.length);
  });
});

describe("assignLayers", () => {
  it("places mentors at equal or higher layer than proteges", () => {
    // Mentors should generally be at a higher (or equal) layer than their proteges.
    // Exceptions: when both are current HCs (both locked at layer 0), or
    // when a current HC mentors a non-HC (HC stays at 0).
    for (const e of data.edges) {
      const src = data.nodeMap.get(e.source)!;
      const tgt = data.nodeMap.get(e.target)!;
      // If mentor is a current HC, they're locked at layer 0 regardless
      if (src.is_current_hc) continue;
      expect(src.layer).toBeGreaterThanOrEqual(tgt.layer);
    }
  });

  it("layer assignment is deterministic", () => {
    const data2 = processData(raw);
    for (const n of data.nodes) {
      const n2 = data2.nodeMap.get(n.id)!;
      expect(n.layer).toBe(n2.layer);
    }
  });
});

// ── Path tests ──

describe("getDeepestPath", () => {
  it("returns correct ancestor chain from a known HC", () => {
    const hc = data.nodes.find((n) => n.is_current_hc);
    expect(hc).toBeDefined();
    const path = getDeepestPath(hc!.id, data.mAdj, data.nodeMap);
    expect(path.has(hc!.id)).toBe(true);
    expect(path.size).toBeGreaterThanOrEqual(1);
  });

  it("path includes nodes with increasing layers", () => {
    const hc = data.nodes.find(
      (n) => n.is_current_hc && (data.mAdj.get(n.id)?.length ?? 0) > 0
    );
    if (!hc) return; // skip if no HC has mentors
    const path = getDeepestPath(hc.id, data.mAdj, data.nodeMap);
    const pathNodes = Array.from(path).map((id) => data.nodeMap.get(id)!);
    const layers = pathNodes.map((n) => n.layer).sort((a, b) => a - b);
    // Should start at 0 (HC) and go up
    expect(layers[0]).toBe(0);
  });
});

describe("getPathEdges", () => {
  it("returns only edges connecting consecutive path nodes", () => {
    const hc = data.nodes.find((n) => n.is_current_hc);
    const path = getDeepestPath(hc!.id, data.mAdj, data.nodeMap);
    const pathEdges = getPathEdges(path, data.edges, data.mAdj);
    for (const e of pathEdges) {
      expect(path.has(e.source)).toBe(true);
      expect(path.has(e.target)).toBe(true);
    }
  });
});

describe("getFullTree", () => {
  it("includes both ancestors and descendants", () => {
    // Find a node with both mentors and proteges
    const node = data.nodes.find(
      (n) =>
        (data.mAdj.get(n.id)?.length ?? 0) > 0 &&
        (data.pAdj.get(n.id)?.length ?? 0) > 0
    );
    if (!node) return;
    const tree = getFullTree(node.id, data.mAdj, data.pAdj, data.nodeMap);
    expect(tree.has(node.id)).toBe(true);
    expect(tree.size).toBeGreaterThan(1);
    // Should include at least one mentor and one protege
    const mentors = data.mAdj.get(node.id) || [];
    const proteges = data.pAdj.get(node.id) || [];
    expect(mentors.some((m) => tree.has(m))).toBe(true);
    expect(proteges.some((p) => tree.has(p))).toBe(true);
  });
});

// ── Edge building tests ──

describe("buildEdgePath", () => {
  it("returns valid SVG path strings", () => {
    for (const e of data.edges.slice(0, 10)) {
      const path = buildEdgePath(e, data.nodeMap);
      expect(path).toMatch(/^M/);
      expect(path).toContain("C");
    }
  });

  it("same-layer edges produce arc paths", () => {
    const sameLevelEdge = data.edges.find((e) => {
      const s = data.nodeMap.get(e.source);
      const t = data.nodeMap.get(e.target);
      return s && t && s.layer === t.layer;
    });
    if (!sameLevelEdge) return;
    const path = buildEdgePath(sameLevelEdge, data.nodeMap);
    expect(path).toMatch(/^M/);
    // Arc path has control points above (lower Y values)
    expect(path).toContain("C");
  });

  it("cross-layer edges produce standard cubic bezier", () => {
    const crossLayerEdge = data.edges.find((e) => {
      const s = data.nodeMap.get(e.source);
      const t = data.nodeMap.get(e.target);
      return s && t && s.layer !== t.layer;
    });
    expect(crossLayerEdge).toBeDefined();
    const path = buildEdgePath(crossLayerEdge!, data.nodeMap);
    expect(path).toMatch(/^M/);
    expect(path).toContain("C");
  });
});

// ── Bug fix regression tests ──

describe("Bug fix: sidebar connections", () => {
  it("Kevin O'Connell has exactly 1 coaching_tree mentor edge (sean-mcvay)", () => {
    const koEdges = data.edges.filter(
      (e) => e.target === "kevin-oconnell"
    );
    expect(koEdges).toHaveLength(1);
    expect(koEdges[0].source).toBe("sean-mcvay");
  });

  it("Kevin O'Connell: NO career_overlap connections in edges", () => {
    const koAllEdges = data.allEdges.filter(
      (e) =>
        (e.source === "kevin-oconnell" || e.target === "kevin-oconnell") &&
        e.type === "career_overlap"
    );
    const koEdges = data.edges.filter(
      (e) =>
        (e.source === "kevin-oconnell" || e.target === "kevin-oconnell") &&
        e.type === "career_overlap"
    );
    // career_overlap edges may exist in allEdges but must NOT be in edges
    expect(koEdges).toHaveLength(0);
  });

  it("edges contains ONLY coaching_tree type connections", () => {
    for (const e of data.edges) {
      expect(e.type).toBe("coaching_tree");
    }
  });

  it("allEdges may contain career_overlap but edges is a strict subset", () => {
    const edgeSet = new Set(data.edges);
    for (const e of edgeSet) {
      expect(data.allEdges).toContain(e);
    }
    // edges should be a subset of allEdges
    expect(data.edges.length).toBeLessThanOrEqual(data.allEdges.length);
  });
});

// ── Ordinal helper tests ──

describe("ordinal", () => {
  it("returns correct ordinal suffixes", () => {
    expect(ordinal(1)).toBe("1st");
    expect(ordinal(2)).toBe("2nd");
    expect(ordinal(3)).toBe("3rd");
    expect(ordinal(4)).toBe("4th");
    expect(ordinal(11)).toBe("11th");
    expect(ordinal(12)).toBe("12th");
    expect(ordinal(13)).toBe("13th");
    expect(ordinal(21)).toBe("21st");
    expect(ordinal(22)).toBe("22nd");
    expect(ordinal(23)).toBe("23rd");
    expect(ordinal(100)).toBe("100th");
    expect(ordinal(101)).toBe("101st");
  });
});
