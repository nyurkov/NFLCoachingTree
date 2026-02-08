"use client";

import {
  useEffect,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import * as d3 from "d3";
import {
  ProcessedData,
  CoachNode,
  Connection,
  CARD_W,
  CARD_H,
  LAYER_SP,
  PAD,
  LAYER_LABELS,
} from "@/lib/types";
import { buildEdgePath, ordinal, getDeepestPath, getPathEdges } from "@/lib/graph";

export interface GraphHandle {
  zoomToNode: (id: string) => void;
  zoomToFit: (duration?: number) => void;
}

interface Props {
  data: ProcessedData;
  selectedCoach: CoachNode | null;
  clickPath: string[];
  searchHighlight: {
    nodes: Set<string>;
    edges: Set<Connection>;
  } | null;
  onNodeClick: (coach: CoachNode) => void;
  onBackgroundClick: () => void;
}

const CoachingTreeGraph = forwardRef<GraphHandle, Props>(function CoachingTreeGraph(
  { data, selectedCoach, clickPath, searchHighlight, onNodeClick, onBackgroundClick },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const nodeGroupsRef = useRef<d3.Selection<SVGGElement, CoachNode, SVGGElement, unknown> | null>(null);
  const edgePathsRef = useRef<d3.Selection<SVGPathElement, Connection, SVGGElement, unknown> | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const dimsRef = useRef({ cw: 0, ch: 0 });

  // Refs for stale closure prevention
  const callbacksRef = useRef({ onNodeClick, onBackgroundClick });
  callbacksRef.current = { onNodeClick, onBackgroundClick };

  const clickPathRef = useRef(clickPath);
  clickPathRef.current = clickPath;

  const searchHighlightRef = useRef(searchHighlight);
  searchHighlightRef.current = searchHighlight;

  // ── Tooltip positioning ──
  const positionTooltip = useCallback((event: MouseEvent | TouchEvent) => {
    const tip = tooltipRef.current;
    if (!tip) return;
    tip.style.left = "0px";
    tip.style.top = "0px";
    const rect = tip.getBoundingClientRect();
    const tw = rect.width;
    const th = rect.height;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const clientX = "touches" in event ? event.touches[0].clientX : event.clientX;
    const clientY = "touches" in event ? event.touches[0].clientY : event.clientY;
    let left = clientX + 14;
    let top = clientY - 10;
    if (left + tw > vw - 16) left = vw - tw - 16;
    if (left < 16) left = 16;
    if (top + th > vh - 16) top = vh - th - 16;
    if (top < 16) top = 16;
    tip.style.left = left + "px";
    tip.style.top = top + "px";
  }, []);

  // ── Imperative handle for parent ──
  useImperativeHandle(ref, () => ({
    zoomToNode: (id: string) => {
      const node = data.nodeMap.get(id);
      if (!node || !svgRef.current || !zoomBehaviorRef.current) return;
      const { cw, ch } = dimsRef.current;
      const scale = 1.5;
      const isMobile = window.innerWidth <= 768;
      const tx = cw / 2 - node.x * scale;
      // On mobile, place node in top third so bottom sheet doesn't cover it
      const ty = (isMobile ? ch * 0.3 : ch / 2) - node.y * scale;
      d3.select(svgRef.current)
        .transition()
        .duration(600)
        .call(
          zoomBehaviorRef.current.transform,
          d3.zoomIdentity.translate(tx, ty).scale(scale)
        );
    },
    zoomToFit: (duration = 500) => {
      if (!gRef.current || !svgRef.current || !zoomBehaviorRef.current) return;
      const bounds = gRef.current.node()!.getBBox();
      if (!bounds.width || !bounds.height) return;
      const { cw, ch } = dimsRef.current;
      const pad = 40;
      const scale = Math.min(
        cw / (bounds.width + pad * 2),
        ch / (bounds.height + pad * 2),
        2
      );
      const tx = cw / 2 - (bounds.x + bounds.width / 2) * scale;
      const ty = ch / 2 - (bounds.y + bounds.height / 2) * scale;
      const svg = d3.select(svgRef.current);
      if (duration) {
        svg
          .transition()
          .duration(duration)
          .call(
            zoomBehaviorRef.current.transform,
            d3.zoomIdentity.translate(tx, ty).scale(scale)
          );
      } else {
        svg.call(
          zoomBehaviorRef.current.transform,
          d3.zoomIdentity.translate(tx, ty).scale(scale)
        );
      }
    },
  }));

  // ── Mount effect: render everything ──
  useEffect(() => {
    const container = containerRef.current;
    const svgEl = svgRef.current;
    if (!container || !svgEl) return;

    const cw = container.clientWidth;
    const ch = container.clientHeight;
    dimsRef.current = { cw, ch };

    const svg = d3.select(svgEl);
    svg.selectAll("*").remove();
    svg.attr("width", cw).attr("height", ch);

    // ── Defs ──
    const defs = svg.append("defs");

    // Shadow filter
    const shadow = defs
      .append("filter")
      .attr("id", "card-shadow")
      .attr("x", "-10%")
      .attr("y", "-10%")
      .attr("width", "120%")
      .attr("height", "130%");
    shadow
      .append("feDropShadow")
      .attr("dx", 0)
      .attr("dy", 2)
      .attr("stdDeviation", 4)
      .attr("flood-color", "rgba(0,0,0,0.35)");

    // Glow filter
    const glow = defs
      .append("filter")
      .attr("id", "glow")
      .attr("x", "-25%")
      .attr("y", "-25%")
      .attr("width", "150%")
      .attr("height", "150%");
    glow.append("feGaussianBlur").attr("stdDeviation", 5).attr("result", "blur");
    glow
      .append("feFlood")
      .attr("flood-color", "#60a5fa")
      .attr("flood-opacity", 0.4)
      .attr("result", "color");
    glow
      .append("feComposite")
      .attr("in", "color")
      .attr("in2", "blur")
      .attr("operator", "in")
      .attr("result", "colorBlur");
    const glowMerge = glow.append("feMerge");
    glowMerge.append("feMergeNode").attr("in", "colorBlur");
    glowMerge.append("feMergeNode").attr("in", "SourceGraphic");

    // Clip path for accent bars
    defs
      .append("clipPath")
      .attr("id", "card-clip")
      .append("rect")
      .attr("x", -CARD_W / 2)
      .attr("y", -CARD_H / 2)
      .attr("width", CARD_W)
      .attr("height", CARD_H)
      .attr("rx", 6)
      .attr("ry", 6);

    // ── Main group ──
    const g = svg.append("g").attr("id", "scene");
    gRef.current = g;

    const zoomBehavior = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.06, 3])
      .on("zoom", (e) => g.attr("transform", e.transform));
    zoomBehaviorRef.current = zoomBehavior;
    svg.call(zoomBehavior);

    // ── Layer bands ──
    const bandsG = g.append("g").attr("class", "layer-bands");
    const BAND_H = LAYER_SP;

    for (let l = 0; l <= data.maxLayer; l++) {
      const y = PAD.top + (data.maxLayer - l) * LAYER_SP - BAND_H / 2;

      bandsG
        .append("rect")
        .attr("class", `layer-band ${l % 2 === 0 ? "even" : "odd"}`)
        .attr("x", 0)
        .attr("y", y)
        .attr("width", data.W)
        .attr("height", BAND_H);

      bandsG
        .append("text")
        .attr("class", "layer-label")
        .attr("x", 16)
        .attr("y", y + 18)
        .text(LAYER_LABELS[l] || `Gen ${l}`);
    }

    // ── Edges ──
    const edgesG = g.append("g").attr("class", "edges");

    const edgePaths = edgesG
      .selectAll<SVGPathElement, Connection>(".edge-path")
      .data(data.edges)
      .join("path")
      .attr("class", "edge-path")
      .attr("d", (d) => buildEdgePath(d, data.nodeMap));

    const edgeOverlays = edgesG
      .selectAll<SVGPathElement, Connection>(".edge-overlay")
      .data(data.edges)
      .join("path")
      .attr("class", "edge-overlay")
      .attr("d", (d) => buildEdgePath(d, data.nodeMap));

    edgePathsRef.current = edgePaths;

    // ── Nodes ──
    const nodesG = g.append("g").attr("class", "nodes");

    const nodeGroups = nodesG
      .selectAll<SVGGElement, CoachNode>(".node-group")
      .data(data.nodes)
      .join("g")
      .attr("class", (d) => `node-group ${d.is_current_hc ? "hc" : "historical"}`)
      .attr("transform", (d) => `translate(${d.x},${d.y})`);

    // Card background
    nodeGroups
      .append("rect")
      .attr("class", "node-card")
      .attr("x", -CARD_W / 2)
      .attr("y", -CARD_H / 2)
      .attr("width", CARD_W)
      .attr("height", CARD_H)
      .attr("rx", 6)
      .attr("ry", 6);

    // Team color accent bar for HCs
    nodeGroups
      .filter((d) => d.is_current_hc)
      .append("rect")
      .attr("class", "node-accent")
      .attr("x", -CARD_W / 2)
      .attr("y", -CARD_H / 2)
      .attr("width", 4)
      .attr("height", CARD_H)
      .attr("clip-path", "url(#card-clip)")
      .attr("fill", (d) => data.teamColors[d.current_team!] || "#6b7280");

    // Name text
    nodeGroups
      .append("text")
      .attr("class", "node-name")
      .attr("text-anchor", "middle")
      .attr("dy", (d) => (d.is_current_hc ? -3 : 1))
      .text((d) => d.name);

    // Team subtitle for HCs
    nodeGroups
      .filter((d) => d.is_current_hc && !!d.current_team)
      .append("text")
      .attr("class", "node-subtitle")
      .attr("text-anchor", "middle")
      .attr("dy", 11)
      .text((d) => d.current_team!);

    nodeGroupsRef.current = nodeGroups;

    // ── Interactions ──

    // Helper to apply search highlight
    function applySearchHighlight() {
      const sh = searchHighlightRef.current;
      if (!sh) return;
      nodeGroups.classed("dimmed", (n) => !sh.nodes.has(n.id));
      nodeGroups.classed("highlighted", (n) => sh.nodes.has(n.id));
      edgePaths
        .classed("dimmed", false)
        .classed("highlighted", false)
        .classed("click-path", false);
      edgePaths.classed("dimmed", (e) => !sh.edges.has(e));
      edgePaths.classed("highlighted", (e) => sh.edges.has(e));
    }

    // Helper to highlight click path
    function highlightClickPath() {
      const cp = clickPathRef.current;
      if (cp.length === 0) return;
      const pathSet = new Set(cp);
      const pathEdgeSet = new Set<Connection>();
      for (const e of data.edges) {
        if (pathSet.has(e.source) && pathSet.has(e.target)) {
          pathEdgeSet.add(e);
        }
      }
      nodeGroups.classed("dimmed", (n) => !pathSet.has(n.id));
      nodeGroups.classed("highlighted", (n) => pathSet.has(n.id));
      edgePaths
        .classed("dimmed", false)
        .classed("highlighted", false)
        .classed("click-path", false);
      edgePaths.classed("dimmed", (e) => !pathEdgeSet.has(e));
      edgePaths.classed("click-path", (e) => pathEdgeSet.has(e));
    }

    // Node hover
    nodeGroups
      .on("mouseover", function (event, d) {
        const pathNodes = getDeepestPath(d.id, data.mAdj, data.nodeMap);
        const pathEdges = getPathEdges(pathNodes, data.edges, data.mAdj);

        nodeGroups.classed("dimmed", (n) => !pathNodes.has(n.id));
        nodeGroups.classed("highlighted", (n) => pathNodes.has(n.id));
        edgePaths.classed("dimmed", (e) => !pathEdges.has(e));
        edgePaths.classed("highlighted", (e) => pathEdges.has(e));

        const tip = tooltipRef.current;
        if (tip) {
          let html = `<div class="tip-title">${d.name}</div>`;
          if (d.current_team) html += `<div class="tip-detail">${d.current_team}</div>`;
          html += `<div class="tip-detail">${d.layer === 0 ? "Current Head Coach" : `${ordinal(d.layer)} generation`}</div>`;
          tip.innerHTML = html;
          tip.classList.remove("hidden");
          positionTooltip(event);
        }
      })
      .on("mousemove", (e) => positionTooltip(e))
      .on("mouseout", function () {
        const cp = clickPathRef.current;
        const sh = searchHighlightRef.current;
        if (cp.length > 0) {
          highlightClickPath();
        } else if (sh) {
          applySearchHighlight();
        } else {
          nodeGroups.classed("dimmed", false).classed("highlighted", false);
          edgePaths.classed("dimmed", false).classed("highlighted", false);
        }
        const tip = tooltipRef.current;
        if (tip) tip.classList.add("hidden");
      });

    // Node click
    nodeGroups.on("click", function (event, d) {
      event.stopPropagation();
      callbacksRef.current.onNodeClick(d);
    });

    // Touch support
    nodeGroups.on("touchstart", function (event, d) {
      event.preventDefault();
      event.stopPropagation();

      const pathNodes = getDeepestPath(d.id, data.mAdj, data.nodeMap);
      const pathEdges = getPathEdges(pathNodes, data.edges, data.mAdj);
      nodeGroups.classed("dimmed", (n) => !pathNodes.has(n.id));
      nodeGroups.classed("highlighted", (n) => pathNodes.has(n.id));
      edgePaths.classed("dimmed", (e) => !pathEdges.has(e));
      edgePaths.classed("highlighted", (e) => pathEdges.has(e));

      callbacksRef.current.onNodeClick(d);

      // Zoom to node — offset upward so bottom sheet doesn't cover it
      const scale = 1.5;
      const tx = dimsRef.current.cw / 2 - d.x * scale;
      const ty = dimsRef.current.ch * 0.3 - d.y * scale;
      svg
        .transition()
        .duration(600)
        .call(zoomBehavior.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
    });

    // Background click
    svg.on("click", () => {
      callbacksRef.current.onBackgroundClick();
    });

    // Edge hover
    edgeOverlays
      .on("mouseover", function (event, d) {
        const src = data.nodeMap.get(d.source);
        const tgt = data.nodeMap.get(d.target);
        let cleanCtx = d.context ? d.context.replace(/\[\d+\]/g, "").trim() : "";
        if (cleanCtx && src?.name)
          cleanCtx = cleanCtx.replace(new RegExp(src.name + "[:\\s]*", "g"), "").trim();
        if (cleanCtx && tgt?.name)
          cleanCtx = cleanCtx.replace(new RegExp(tgt.name + "[:\\s]*", "g"), "").trim();
        cleanCtx = cleanCtx
          .replace(/^[,;:\s]+/, "")
          .replace(/[,;:\s]+$/, "")
          .replace(/,(?!\s)/g, ", ")
          .replace(/;/g, ", ")
          .replace(/\s{2,}/g, " ");

        const tip = tooltipRef.current;
        if (tip) {
          let html = `<div class="tip-title">${src?.name || d.source} &rarr; ${tgt?.name || d.target}</div>`;
          if (cleanCtx) html += `<div class="tip-detail">${cleanCtx}</div>`;
          tip.innerHTML = html;
          tip.classList.remove("hidden");
          positionTooltip(event);
        }

        const idx = data.edges.indexOf(d);
        edgePaths.filter((_, i) => i === idx).classed("edge-hover", true);
      })
      .on("mousemove", (e) => positionTooltip(e))
      .on("mouseout", function () {
        const tip = tooltipRef.current;
        if (tip) tip.classList.add("hidden");
        edgePaths.classed("edge-hover", false);
      });

    // ── Initial zoom to fit ──
    requestAnimationFrame(() => {
      const bounds = g.node()!.getBBox();
      if (!bounds.width || !bounds.height) return;
      const pad = 40;
      const scale = Math.min(
        cw / (bounds.width + pad * 2),
        ch / (bounds.height + pad * 2),
        2
      );
      const tx = cw / 2 - (bounds.x + bounds.width / 2) * scale;
      const ty = ch / 2 - (bounds.y + bounds.height / 2) * scale;
      svg
        .transition()
        .duration(800)
        .call(zoomBehavior.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
    });

    // ── ResizeObserver ──
    const ro = new ResizeObserver(() => {
      const newCw = container.clientWidth;
      const newCh = container.clientHeight;
      dimsRef.current = { cw: newCw, ch: newCh };
      svg.attr("width", newCw).attr("height", newCh);

      // Zoom to fit after resize
      const bounds = g.node()?.getBBox();
      if (!bounds || !bounds.width || !bounds.height) return;
      const pad = 40;
      const scale = Math.min(
        newCw / (bounds.width + pad * 2),
        newCh / (bounds.height + pad * 2),
        2
      );
      const tx = newCw / 2 - (bounds.x + bounds.width / 2) * scale;
      const ty = newCh / 2 - (bounds.y + bounds.height / 2) * scale;
      svg
        .transition()
        .duration(300)
        .call(zoomBehavior.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
    };
  }, [data, positionTooltip]);

  // ── Effect: update click path highlighting ──
  useEffect(() => {
    const nodeGroups = nodeGroupsRef.current;
    const edgePaths = edgePathsRef.current;
    if (!nodeGroups || !edgePaths) return;

    if (clickPath.length > 0) {
      const pathSet = new Set(clickPath);
      const pathEdgeSet = new Set<Connection>();
      for (const e of data.edges) {
        if (pathSet.has(e.source) && pathSet.has(e.target)) {
          pathEdgeSet.add(e);
        }
      }
      nodeGroups.classed("dimmed", (n) => !pathSet.has(n.id));
      nodeGroups.classed("highlighted", (n) => pathSet.has(n.id));
      edgePaths
        .classed("dimmed", false)
        .classed("highlighted", false)
        .classed("click-path", false);
      edgePaths.classed("dimmed", (e) => !pathEdgeSet.has(e));
      edgePaths.classed("click-path", (e) => pathEdgeSet.has(e));
    } else if (searchHighlight) {
      nodeGroups.classed("dimmed", (n) => !searchHighlight.nodes.has(n.id));
      nodeGroups.classed("highlighted", (n) => searchHighlight.nodes.has(n.id));
      edgePaths
        .classed("dimmed", false)
        .classed("highlighted", false)
        .classed("click-path", false);
      edgePaths.classed("dimmed", (e) => !searchHighlight.edges.has(e));
      edgePaths.classed("highlighted", (e) => searchHighlight.edges.has(e));
    } else {
      nodeGroups.classed("dimmed", false).classed("highlighted", false);
      edgePaths
        .classed("dimmed", false)
        .classed("highlighted", false)
        .classed("click-path", false);
    }
  }, [clickPath, searchHighlight, data.edges]);

  return (
    <div ref={containerRef} className="flex-1 relative bg-[var(--bg)]">
      <svg
        ref={svgRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
      />
      <div
        ref={tooltipRef}
        className="tooltip hidden"
      />
    </div>
  );
});

export default CoachingTreeGraph;
