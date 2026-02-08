/**
 * NFL Coaching Tree — Layered DAG Visualization
 * Static family-tree layout: current HCs at bottom, mentors above.
 */
(async function () {
  /* ═══════════════════════════════════════════════
     1. LOAD DATA
     ═══════════════════════════════════════════════ */
  let raw;
  try {
    const resp = await fetch("data/coaching_connections.json");
    raw = await resp.json();
  } catch (e) {
    document.getElementById("placeholder").innerHTML =
      "<h3>Error</h3><p>Could not load coaching data. Run the scraper first.</p>";
    return;
  }

  const allCoaches = raw.coaches;
  const allConns = raw.connections;
  const teamColors = raw.team_colors || {};
  const coachById = new Map(allCoaches.map((c) => [c.id, c]));
  const isMobile = () => window.innerWidth <= 768;

  function ordinal(n) {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  /* ═══════════════════════════════════════════════
     2. BFS — ASSIGN LAYERS FROM HCs UPWARD
     Connection direction: source = mentor, target = protege
     ═══════════════════════════════════════════════ */
  const mentorsOf = new Map(); // coachId → [mentorId, ...]
  const protegesOf = new Map(); // coachId → [protegeId, ...]

  for (const c of allConns) {
    if (c.type !== "coaching_tree") continue;
    if (!mentorsOf.has(c.target)) mentorsOf.set(c.target, []);
    mentorsOf.get(c.target).push(c.source);
    if (!protegesOf.has(c.source)) protegesOf.set(c.source, []);
    protegesOf.get(c.source).push(c.target);
  }

  const currentHCs = allCoaches.filter((c) => c.is_current_hc);
  const layerOf = new Map();

  // Step 1: BFS upward from HCs to discover all ancestors
  for (const hc of currentHCs) layerOf.set(hc.id, 0);
  const bfsQ = currentHCs.map((hc) => hc.id);
  let qi = 0;
  while (qi < bfsQ.length) {
    const id = bfsQ[qi++];
    for (const mentorId of mentorsOf.get(id) || []) {
      if (!layerOf.has(mentorId)) {
        layerOf.set(mentorId, 0); // placeholder — computed below
        bfsQ.push(mentorId);
      }
    }
  }

  // Step 2: Longest-path layer assignment
  // Each mentor's layer = max(protege.layer + 1) across all its proteges in tree.
  // This spreads the tree vertically so deep lineages are visible.
  // HCs stay locked at layer 0.
  const MAX_LAYER = 5;
  let changed = true;
  while (changed) {
    changed = false;
    for (const c of allConns) {
      if (c.type !== "coaching_tree") continue;
      if (!layerOf.has(c.source) || !layerOf.has(c.target)) continue;
      const srcCoach = coachById.get(c.source);
      if (srcCoach && srcCoach.is_current_hc) continue; // lock HCs at 0
      const protegeLayer = layerOf.get(c.target);
      const newLayer = Math.min(protegeLayer + 1, MAX_LAYER);
      if (newLayer > layerOf.get(c.source)) {
        layerOf.set(c.source, newLayer);
        changed = true;
      }
    }
  }

  /* ═══════════════════════════════════════════════
     3. PRUNE — KEEP ONLY ANCESTOR PATHS
     ═══════════════════════════════════════════════ */
  const kept = new Set(layerOf.keys());

  const nodes = allCoaches
    .filter((c) => kept.has(c.id))
    .map((c) => ({ ...c, layer: layerOf.get(c.id) }));

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Edges for the tree rendering (coaching_tree, both endpoints pruned)
  const edges = allConns.filter(
    (c) =>
      c.type === "coaching_tree" && kept.has(c.source) && kept.has(c.target)
  );

  // All pruned connections for sidebar
  const allEdges = allConns.filter(
    (c) => kept.has(c.source) && kept.has(c.target)
  );

  const maxLayer = Math.max(0, ...nodes.map((n) => n.layer));

  console.log(
    `Tree: ${nodes.length} nodes, ${edges.length} edges, ${maxLayer + 1} layers`
  );

  /* ═══════════════════════════════════════════════
     4. GROUP BY LAYER & MINIMIZE CROSSINGS
     ═══════════════════════════════════════════════ */
  const layers = Array.from({ length: maxLayer + 1 }, () => []);
  for (const n of nodes) layers[n.layer].push(n);

  // Initial alphabetical sort
  for (const layer of layers) layer.sort((a, b) => a.name.localeCompare(b.name));

  // Build fast adjacency for pruned edges
  const mAdj = new Map(); // coachId → [mentorIds in tree]
  const pAdj = new Map(); // coachId → [protegeIds in tree]
  for (const e of edges) {
    if (!pAdj.has(e.source)) pAdj.set(e.source, []);
    pAdj.get(e.source).push(e.target);
    if (!mAdj.has(e.target)) mAdj.set(e.target, []);
    mAdj.get(e.target).push(e.source);
  }

  // Order index per node
  const orderOf = new Map();
  for (const layer of layers) {
    layer.forEach((n, i) => orderOf.set(n.id, i));
  }

  // Barycenter heuristic — 24 sweeps
  for (let pass = 0; pass < 24; pass++) {
    // Up sweep: reorder layers 1..max by avg protege position below
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
    // Down sweep: reorder layers max-1..0 by avg mentor position above
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

  /* ═══════════════════════════════════════════════
     5. COMPUTE PIXEL POSITIONS
     ═══════════════════════════════════════════════ */
  const CARD_W = 150;
  const CARD_H = 46;
  const GAP = 14;
  const LAYER_SP = 120;
  const PAD = { top: 70, bot: 50, side: 100 };

  const maxCount = Math.max(...layers.map((l) => l.length));
  const W = maxCount * CARD_W + (maxCount - 1) * GAP + 2 * PAD.side;
  const H = (maxLayer + 1) * LAYER_SP + PAD.top + PAD.bot;

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

  /* ═══════════════════════════════════════════════
     6. SVG SETUP
     ═══════════════════════════════════════════════ */
  const container = document.getElementById("graph-container");
  const svg = d3.select("#graph");
  let cw = container.clientWidth;
  let ch = container.clientHeight;
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
  glow
    .append("feGaussianBlur")
    .attr("stdDeviation", 5)
    .attr("result", "blur");
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

  // Main group for zoom/pan
  const g = svg.append("g").attr("id", "scene");

  const zoomBehavior = d3
    .zoom()
    .scaleExtent([0.06, 3])
    .on("zoom", (e) => g.attr("transform", e.transform));
  svg.call(zoomBehavior);

  /* ═══════════════════════════════════════════════
     7. RENDER LAYER BANDS
     ═══════════════════════════════════════════════ */
  const bandsG = g.append("g").attr("class", "layer-bands");
  const BAND_H = LAYER_SP;

  const layerLabels = [
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

  for (let l = 0; l <= maxLayer; l++) {
    const y = PAD.top + (maxLayer - l) * LAYER_SP - BAND_H / 2;

    bandsG
      .append("rect")
      .attr("class", `layer-band ${l % 2 === 0 ? "even" : "odd"}`)
      .attr("x", 0)
      .attr("y", y)
      .attr("width", W)
      .attr("height", BAND_H);

    bandsG
      .append("text")
      .attr("class", "layer-label")
      .attr("x", 16)
      .attr("y", y + 18)
      .text(layerLabels[l] || `Gen ${l}`);
  }

  /* ═══════════════════════════════════════════════
     8. RENDER EDGES
     ═══════════════════════════════════════════════ */
  const edgesG = g.append("g").attr("class", "edges");

  function buildEdgePath(d) {
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

    // Normal: draw from the visually higher node (lower Y) down to the lower
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

  const edgePaths = edgesG
    .selectAll(".edge-path")
    .data(edges)
    .join("path")
    .attr("class", "edge-path")
    .attr("d", buildEdgePath);

  const edgeOverlays = edgesG
    .selectAll(".edge-overlay")
    .data(edges)
    .join("path")
    .attr("class", "edge-overlay")
    .attr("d", buildEdgePath);

  /* ═══════════════════════════════════════════════
     9. RENDER NODES
     ═══════════════════════════════════════════════ */
  const nodesG = g.append("g").attr("class", "nodes");

  const nodeGroups = nodesG
    .selectAll(".node-group")
    .data(nodes)
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
    .attr("fill", (d) => teamColors[d.current_team] || "#6b7280");

  // Name text
  nodeGroups
    .append("text")
    .attr("class", "node-name")
    .attr("text-anchor", "middle")
    .attr("dy", (d) => (d.is_current_hc ? -3 : 1))
    .text((d) => d.name);

  // Team subtitle for HCs
  nodeGroups
    .filter((d) => d.is_current_hc && d.current_team)
    .append("text")
    .attr("class", "node-subtitle")
    .attr("text-anchor", "middle")
    .attr("dy", 11)
    .text((d) => d.current_team);

  /* ═══════════════════════════════════════════════
     10. INTERACTIONS
     ═══════════════════════════════════════════════ */
  const tooltip = d3.select("#tooltip");

  // DFS upward — find single longest mentor chain
  function getDeepestPath(startId) {
    let bestPath = [startId];
    function dfs(nodeId, path) {
      const mentors = (mAdj.get(nodeId) || []).filter(id => nodeMap.has(id));
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

  // Build set of edges on the path (consecutive pairs)
  function getPathEdges(pathSet) {
    const pathEdges = new Set();
    for (const e of edges) {
      if (pathSet.has(e.source) && pathSet.has(e.target)) {
        // Check they are consecutive in the mentor chain (source is mentor of target)
        const mentors = mAdj.get(e.target) || [];
        if (mentors.includes(e.source)) pathEdges.add(e);
      }
    }
    return pathEdges;
  }

  // Node hover — highlight deepest ancestor path
  nodeGroups
    .on("mouseover", function (event, d) {
      const pathNodes = getDeepestPath(d.id);
      const pathEdges = getPathEdges(pathNodes);

      nodeGroups.classed("dimmed", (n) => !pathNodes.has(n.id));
      nodeGroups.classed("highlighted", (n) => pathNodes.has(n.id));

      edgePaths.classed("dimmed", (e) => !pathEdges.has(e));
      edgePaths.classed("highlighted", (e) => pathEdges.has(e));

      let html = `<div class="tip-title">${d.name}</div>`;
      if (d.current_team)
        html += `<div class="tip-detail">${d.current_team}</div>`;
      html += `<div class="tip-detail">${d.layer === 0 ? "Current Head Coach" : `${ordinal(d.layer)} generation`}</div>`;
      tooltip.html(html).classed("hidden", false);
      positionTooltip(event);
    })
    .on("mousemove", (e) => positionTooltip(e))
    .on("mouseout", function () {
      if (clickPath.length > 0) {
        highlightClickPath();
      } else if (activeSearchNodes) {
        applySearchHighlight();
      } else {
        nodeGroups.classed("dimmed", false).classed("highlighted", false);
        edgePaths.classed("dimmed", false).classed("highlighted", false);
      }
      tooltip.classed("hidden", true);
    });

  // Click path tracking
  let clickPath = [];

  function highlightClickPath() {
    if (clickPath.length === 0) return;
    const pathSet = new Set(clickPath);
    // Highlight any rendered edge where both endpoints are in the path
    const pathEdgeSet = new Set();
    for (const e of edges) {
      if (pathSet.has(e.source) && pathSet.has(e.target)) {
        pathEdgeSet.add(e);
      }
    }
    nodeGroups.classed("dimmed", (n) => !pathSet.has(n.id));
    nodeGroups.classed("highlighted", (n) => pathSet.has(n.id));
    edgePaths.classed("dimmed", false).classed("highlighted", false).classed("click-path", false);
    edgePaths.classed("dimmed", (e) => !pathEdgeSet.has(e));
    edgePaths.classed("click-path", (e) => pathEdgeSet.has(e));
  }

  function clearClickPath() {
    clickPath = [];
    nodeGroups.classed("dimmed", false).classed("highlighted", false);
    edgePaths.classed("dimmed", false).classed("highlighted", false).classed("click-path", false);
  }

  // Node click — sidebar details + start new path
  nodeGroups.on("click", function (event, d) {
    event.stopPropagation();
    clickPath = [d.id];
    highlightClickPath();
    showDetails(d);
  });

  // Touch support — single tap combines hover highlight + click behavior
  nodeGroups.on("touchstart", function (event, d) {
    event.preventDefault();
    event.stopPropagation();
    const pathNodes = getDeepestPath(d.id);
    const pathEdges = getPathEdges(pathNodes);
    nodeGroups.classed("dimmed", (n) => !pathNodes.has(n.id));
    nodeGroups.classed("highlighted", (n) => pathNodes.has(n.id));
    edgePaths.classed("dimmed", (e) => !pathEdges.has(e));
    edgePaths.classed("highlighted", (e) => pathEdges.has(e));
    clickPath = [d.id];
    highlightClickPath();
    showDetails(d);
    zoomToNode(d);
  });

  svg.on("click", () => {
    clearClickPath();
    document.getElementById("coach-details").classList.add("hidden");
    document.getElementById("placeholder").classList.remove("hidden");
    if (isMobile()) document.getElementById("sidebar").classList.remove("open");
  });

  // Edge hover — tooltip
  edgeOverlays
    .on("mouseover", function (event, d) {
      const src = coachById.get(d.source);
      const tgt = coachById.get(d.target);
      let cleanCtx = d.context ? d.context.replace(/\[\d+\]/g, "").trim() : "";
      // Strip redundant coach names from context
      if (cleanCtx && src?.name) cleanCtx = cleanCtx.replace(new RegExp(src.name + "[:\\s]*", "g"), "").trim();
      if (cleanCtx && tgt?.name) cleanCtx = cleanCtx.replace(new RegExp(tgt.name + "[:\\s]*", "g"), "").trim();
      cleanCtx = cleanCtx.replace(/^[,;:\s]+/, "")
                          .replace(/[,;:\s]+$/, "")
                          .replace(/,(?!\s)/g, ", ")
                          .replace(/;/g, ", ")
                          .replace(/\s{2,}/g, " ");
      let html = `<div class="tip-title">${src?.name || d.source} &rarr; ${tgt?.name || d.target}</div>`;
      if (cleanCtx) html += `<div class="tip-detail">${cleanCtx}</div>`;
      tooltip.html(html).classed("hidden", false);
      positionTooltip(event);

      const idx = edges.indexOf(d);
      edgePaths.filter((_, i) => i === idx).classed("edge-hover", true);
    })
    .on("mousemove", (e) => positionTooltip(e))
    .on("mouseout", function () {
      tooltip.classed("hidden", true);
      edgePaths.classed("edge-hover", false);
    });

  function positionTooltip(event) {
    const tipNode = tooltip.node();
    tooltip.style("left", "0px").style("top", "0px");
    const rect = tipNode.getBoundingClientRect();
    const tw = rect.width;
    const th = rect.height;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = event.clientX + 14;
    let top = event.clientY - 10;
    if (left + tw > vw - 16) left = vw - tw - 16;
    if (left < 16) left = 16;
    if (top + th > vh - 16) top = vh - th - 16;
    if (top < 16) top = 16;
    tooltip.style("left", left + "px").style("top", top + "px");
  }

  function zoomToNode(node) {
    const scale = 1.5;
    const tx = cw / 2 - node.x * scale;
    const ty = ch / 2 - node.y * scale;
    svg.transition().duration(600)
      .call(zoomBehavior.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  }

  function showDetails(d) {
    document.getElementById("placeholder").classList.add("hidden");
    const det = document.getElementById("coach-details");
    det.classList.remove("hidden");
    if (isMobile()) document.getElementById("sidebar").classList.add("open");

    document.getElementById("detail-name").textContent = d.name;

    const teamEl = document.getElementById("detail-team");
    if (d.current_team) {
      teamEl.textContent = d.current_team;
      teamEl.style.borderLeftColor = teamColors[d.current_team] || "#6b7280";
      teamEl.classList.remove("hidden");
    } else {
      teamEl.classList.add("hidden");
    }

    document.getElementById("detail-role").textContent = d.is_current_hc
      ? "Current Head Coach"
      : `${ordinal(d.layer)} generation`;

    const wikiLink = document.getElementById("detail-wiki");
    wikiLink.href = `https://en.wikipedia.org/wiki/${d.name.replace(/ /g, "_")}`;
    wikiLink.textContent = "Wikipedia \u2197";

    const list = document.getElementById("detail-connections");
    list.innerHTML = "";

    const related = allEdges.filter(
      (e) => e.source === d.id || e.target === d.id
    );

    for (const e of related) {
      const otherId = e.source === d.id ? e.target : e.source;
      const other = coachById.get(otherId);
      if (!other) continue;

      const isMentor = e.target === d.id;
      const direction = isMentor ? "Mentored by" : "Mentor of";

      const li = document.createElement("li");
      li.innerHTML = `
        <span class="conn-dir">${direction}</span>
        <span class="conn-name">${other.name}</span>
      `;

      if (nodeMap.has(otherId)) {
        li.style.cursor = "pointer";
        if (clickPath.includes(otherId)) li.classList.add("in-path");
        li.addEventListener("click", () => {
          const target = nodes.find((n) => n.id === otherId);
          if (target) {
            clickPath.push(target.id);
            highlightClickPath();
            showDetails(target);
            zoomToNode(target);
          }
        });
      }

      list.appendChild(li);
    }
  }

  /* ═══════════════════════════════════════════════
     11. CONTROLS
     ═══════════════════════════════════════════════ */
  document.getElementById("reset-zoom").addEventListener("click", () => {
    clearSearch();
    zoomToFit(500);
  });

  /* ── Search ── */
  const searchInput = document.getElementById("coach-search");
  const searchResults = document.getElementById("search-results");
  let activeIdx = -1;
  let activeSearchNodes = null; // Set of node IDs when search is active
  let activeSearchEdges = null; // Set of edge objects when search is active

  function applySearchHighlight() {
    if (!activeSearchNodes) return;
    nodeGroups.classed("dimmed", n => !activeSearchNodes.has(n.id));
    nodeGroups.classed("highlighted", n => activeSearchNodes.has(n.id));
    edgePaths.classed("dimmed", false).classed("highlighted", false).classed("click-path", false);
    edgePaths.classed("dimmed", e => !activeSearchEdges.has(e));
    edgePaths.classed("highlighted", e => activeSearchEdges.has(e));
  }

  // Get full recursive tree: all ancestors + all descendants
  function getFullTree(startId) {
    const visited = new Set([startId]);
    const q = [startId];
    let i = 0;
    // BFS upward through mentors
    while (i < q.length) {
      const curr = q[i++];
      for (const m of (mAdj.get(curr) || [])) {
        if (!visited.has(m) && nodeMap.has(m)) { visited.add(m); q.push(m); }
      }
    }
    // BFS downward through proteges
    const q2 = [startId];
    i = 0;
    while (i < q2.length) {
      const curr = q2[i++];
      for (const p of (pAdj.get(curr) || [])) {
        if (!visited.has(p) && nodeMap.has(p)) { visited.add(p); q2.push(p); }
      }
    }
    return visited;
  }

  function zoomToSubgraph(nodeSet) {
    const subNodes = nodes.filter(n => nodeSet.has(n.id));
    if (subNodes.length === 0) return;
    const minX = Math.min(...subNodes.map(n => n.x)) - CARD_W;
    const maxX = Math.max(...subNodes.map(n => n.x)) + CARD_W;
    const minY = Math.min(...subNodes.map(n => n.y)) - CARD_H;
    const maxY = Math.max(...subNodes.map(n => n.y)) + CARD_H;
    const bw = maxX - minX;
    const bh = maxY - minY;
    const pad = 40;
    const scale = Math.min(cw / (bw + pad * 2), ch / (bh + pad * 2), 2);
    const tx = cw / 2 - (minX + bw / 2) * scale;
    const ty = ch / 2 - (minY + bh / 2) * scale;
    svg.transition().duration(600)
      .call(zoomBehavior.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  }

  function selectSearchResult(coach) {
    searchInput.value = coach.name;
    searchResults.classList.add("hidden");
    activeIdx = -1;

    activeSearchNodes = getFullTree(coach.id);
    activeSearchEdges = new Set();
    for (const e of edges) {
      if (activeSearchNodes.has(e.source) && activeSearchNodes.has(e.target)) activeSearchEdges.add(e);
    }

    clearClickPath();
    applySearchHighlight();

    const targetNode = nodes.find(n => n.id === coach.id);
    if (targetNode) zoomToNode(targetNode);
  }

  function clearSearch() {
    searchInput.value = "";
    searchResults.classList.add("hidden");
    activeIdx = -1;
    activeSearchNodes = null;
    activeSearchEdges = null;
    clearClickPath();
    nodeGroups.classed("dimmed", false).classed("highlighted", false);
    edgePaths.classed("dimmed", false).classed("highlighted", false);
  }

  searchInput.addEventListener("input", () => {
    const query = searchInput.value.trim().toLowerCase();
    if (!query) {
      searchResults.classList.add("hidden");
      clearClickPath();
      nodeGroups.classed("dimmed", false).classed("highlighted", false);
      edgePaths.classed("dimmed", false).classed("highlighted", false);
      return;
    }
    const matches = nodes.filter(n => n.name.toLowerCase().includes(query)).slice(0, 8);
    activeIdx = -1;
    if (matches.length === 0) {
      searchResults.classList.add("hidden");
      return;
    }
    searchResults.innerHTML = "";
    matches.forEach((m, i) => {
      const li = document.createElement("li");
      li.innerHTML = `${m.name}${m.current_team ? `<span class="search-team">${m.current_team}</span>` : ""}`;
      li.addEventListener("click", () => selectSearchResult(m));
      li.addEventListener("mouseenter", () => {
        activeIdx = i;
        updateActiveResult();
      });
      searchResults.appendChild(li);
    });
    searchResults.classList.remove("hidden");
  });

  searchInput.addEventListener("keydown", (e) => {
    const items = searchResults.querySelectorAll("li");
    if (!items.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIdx = Math.min(activeIdx + 1, items.length - 1);
      updateActiveResult();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIdx = Math.max(activeIdx - 1, 0);
      updateActiveResult();
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      items[activeIdx].click();
    } else if (e.key === "Escape") {
      clearSearch();
      searchInput.blur();
    }
  });

  function updateActiveResult() {
    const items = searchResults.querySelectorAll("li");
    items.forEach((li, i) => li.classList.toggle("active", i === activeIdx));
  }

  // Close search dropdown when clicking outside
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-wrapper")) {
      searchResults.classList.add("hidden");
    }
  });

  document
    .getElementById("sidebar-close")
    .addEventListener("click", () => {
      clearClickPath();
      document.getElementById("coach-details").classList.add("hidden");
      document.getElementById("placeholder").classList.remove("hidden");
      if (isMobile()) document.getElementById("sidebar").classList.remove("open");
    });

  /* ═══════════════════════════════════════════════
     12. INITIAL VIEW — ZOOM TO FIT
     ═══════════════════════════════════════════════ */
  function zoomToFit(duration) {
    const bounds = g.node().getBBox();
    if (!bounds.width || !bounds.height) return;

    const pad = 40;
    const scale = Math.min(
      cw / (bounds.width + pad * 2),
      ch / (bounds.height + pad * 2),
      2
    );
    const tx = cw / 2 - (bounds.x + bounds.width / 2) * scale;
    const ty = ch / 2 - (bounds.y + bounds.height / 2) * scale;

    if (duration) {
      svg
        .transition()
        .duration(duration)
        .call(
          zoomBehavior.transform,
          d3.zoomIdentity.translate(tx, ty).scale(scale)
        );
    } else {
      svg.call(
        zoomBehavior.transform,
        d3.zoomIdentity.translate(tx, ty).scale(scale)
      );
    }
  }

  zoomToFit(800);

  // Responsive resize handler
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      cw = container.clientWidth;
      ch = container.clientHeight;
      svg.attr("width", cw).attr("height", ch);
      zoomToFit(300);
    }, 150);
  });

  // Stats
  const statEl = document.getElementById("stat-info");
  if (statEl) {
    statEl.textContent = `${nodes.length} coaches \u00B7 ${edges.length} connections`;
  }

  console.log("Coaching tree rendered.");
})();
