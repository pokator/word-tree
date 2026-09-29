// The graph's physics and node placement, as plain functions -- shared by
// the live graph (useForceSimulation, one persistent simulation that React
// re-renders on every tick) and the server-rendered previews on the kanji
// and word pages (layoutGraphSteps, the same simulation run to rest), so a
// preview is laid out exactly the way the explorer would lay it out.
import { forceSimulation, forceManyBody, forceLink, forceCollide, forceX, forceY } from "d3-force";
import { nodeRadius } from "./layout.js";
import { kanjiPositionCategory, POSITION_ORDER } from "./positionCategory.js";
import { linkDistanceKey } from "./linkDistanceKey.js";

// Degree-scaled link length: a hub (a kanji revealing many words at once)
// needs its ring pushed further out than the default, or its siblings
// cram into a tight circle that the collision force can only resolve
// by jittering against itself indefinitely. BASE_LINK_DISTANCE matches
// the old fixed distance, so small graphs look the same as before.
const BASE_LINK_DISTANCE = 110;
const DENSE_THRESHOLD = 4;
const DISTANCE_PER_EXTRA_SIBLING = 14;

// The view's vertical centering target sits a little above true center,
// leaving room below the graph for the floating legend/zoom controls.
export const CENTER_Y_BIAS = 0.42;

export function baseLinkDistance(siblingCount) {
  return BASE_LINK_DISTANCE + Math.max(0, siblingCount - DENSE_THRESHOLD) * DISTANCE_PER_EXTRA_SIBLING;
}

const FULL_CIRCLE = Math.PI * 2;
const MIN_OUTWARD_SECTOR = (140 * Math.PI) / 180;
const MAX_OUTWARD_SECTOR = (300 * Math.PI) / 180;
const OUTWARD_SECTOR_GROWTH_PER_SIBLING = (6 * Math.PI) / 180;

export function outwardSectorWidth(siblingCount) {
  return Math.min(
    MAX_OUTWARD_SECTOR,
    MIN_OUTWARD_SECTOR + Math.max(0, siblingCount - DENSE_THRESHOLD) * OUTWARD_SECTOR_GROWTH_PER_SIBLING
  );
}

// Angles (radians, around their shared parent) for a batch of siblings
// revealed together. baseAngle/sectorWidth constrain them to the outward
// direction siblings may use; null baseAngle means no established direction
// yet (the root's own first ring) so the full circle is fair game. When the
// parent is a kanji, siblings are first grouped by kanjiPositionCategory and
// each group gets a contiguous sub-sector sized proportionally to its member
// count, so a mixed batch visually clusters by role instead of interleaving
// them by rank. A non-kanji parent (a word revealing its own component
// kanji) just spaces its siblings evenly across the sector.
export function computeSiblingAngles(siblingIds, parentData, graphNodes, { baseAngle = null, sectorWidth = FULL_CIRCLE } = {}) {
  const angleById = new Map();
  const total = siblingIds.length;
  if (total === 0) return angleById;

  const span = baseAngle === null ? FULL_CIRCLE : sectorWidth;
  const start = (baseAngle ?? 0) - span / 2;

  if (parentData?.type === "kanji") {
    const buckets = { start: [], middle: [], end: [] };
    for (const id of siblingIds) {
      const word = graphNodes.get(id)?.word ?? "";
      buckets[kanjiPositionCategory(word, parentData.char)].push(id);
    }
    let cursor = start;
    for (const cat of POSITION_ORDER) {
      const group = buckets[cat];
      if (group.length === 0) continue;
      const sectorSize = (span * group.length) / total;
      group.forEach((id, i) => {
        angleById.set(id, cursor + (sectorSize * (i + 0.5)) / group.length);
      });
      cursor += sectorSize;
    }
    return angleById;
  }

  siblingIds.forEach((id, i) => {
    const t = total === 1 ? 0.5 : (i + 0.5) / total;
    angleById.set(id, start + span * t);
  });
  return angleById;
}

/**
 * Everything the layout remembers between graph changes:
 *  - nodes: id -> simulation node (positions persist as the graph grows)
 *  - parentDegree: parentId -> sibling count, read by the link distance
 *  - linkDistance: linkDistanceKey(a,b) -> an override (a user's drag, or a
 *    bridge word pinned between its kanji) over the degree-based default
 *  - bridgedWords: words already snapped between their kanji parents -- a
 *    one-time nudge, so it doesn't keep fighting a later drag
 *  - originParent: nodeId -> the node that first revealed it, a stable
 *    "which way is outward" reference for its own future children
 */
export function createLayoutState() {
  return {
    nodes: new Map(),
    parentDegree: new Map(),
    linkDistance: new Map(),
    bridgedWords: new Set(),
    originParent: new Map(),
  };
}

const idOf = (endpoint) => (typeof endpoint === "object" ? endpoint.id : endpoint);

/** The explorer's forces, reading distances from `state`. */
export function createSimulation(state, width, height) {
  return forceSimulation([])
    .force("charge", forceManyBody().strength(-240))
    .force("collide", forceCollide().radius((d) => nodeRadius(d) + (d.type === "kanji" ? 30 : 20)))
    .force(
      "link",
      forceLink([])
        .id((d) => d.id)
        .distance((l) => {
          const custom = state.linkDistance.get(linkDistanceKey(idOf(l.source), idOf(l.target)));
          if (custom !== undefined) return custom;
          return baseLinkDistance(state.parentDegree.get(idOf(l.source)) ?? 1);
        })
        .strength(0.5)
    )
    .force("x", forceX(width / 2).strength(0.03))
    .force("y", forceY(height * CENTER_Y_BIAS).strength(0.03));
}

export function setSimulationSize(sim, width, height) {
  sim.force("x", forceX(width / 2).strength(0.03));
  sim.force("y", forceY(height * CENTER_Y_BIAS).strength(0.03));
}

/**
 * Bring `state` in line with `graph`: drop removed nodes, place new ones
 * (fanned out around the parent that revealed them, or between two kanji
 * for a word they share), and hand the result to `sim`. Existing nodes
 * keep their positions. `random` jitters the very first node (the root).
 */
export function reconcileLayout(state, sim, graph, width, height, random = Math.random) {
  const simNodesMap = state.nodes;

  for (const id of Array.from(simNodesMap.keys())) {
    if (!graph.nodes.has(id)) simNodesMap.delete(id);
  }
  for (const id of Array.from(state.originParent.keys())) {
    if (!graph.nodes.has(id)) state.originParent.delete(id);
  }

  // wordId -> Set(kanjiId) for every kanji that reveals this word -- most
  // words have one, but a word built from several kanji (日本 from 日 and
  // 本) can end up linked from each once each kanji has been expanded.
  const kanjiParentsByWord = new Map();
  for (const l of graph.links) {
    const s = idOf(l.source);
    const t = idOf(l.target);
    if (graph.nodes.get(s)?.type === "kanji") {
      if (!kanjiParentsByWord.has(t)) kanjiParentsByWord.set(t, new Set());
      kanjiParentsByWord.get(t).add(s);
    }
  }

  // Recomputed from scratch: a hub revealed across several "show more"
  // batches needs its ring sized for its TOTAL sibling count.
  const parentDegree = new Map();
  for (const l of graph.links) {
    const s = idOf(l.source);
    if (graph.nodes.get(s)?.type === "kanji") parentDegree.set(s, (parentDegree.get(s) ?? 0) + 1);
  }
  state.parentDegree = parentDegree;

  // A node is "known" (usable as a parent) once it's in the simulation from
  // an earlier pass, or walked past earlier in THIS pass -- buildGraph.js
  // always inserts a parent before its children, so insertion order alone
  // guarantees the true parent is seen first.
  const seenThisPass = new Set();
  const findParentId = (id) => {
    const link = graph.links.find((l) => {
      const s = idOf(l.source);
      const t = idOf(l.target);
      const sKnown = simNodesMap.has(s) || seenThisPass.has(s);
      const tKnown = simNodesMap.has(t) || seenThisPass.has(t);
      return (t === id && sKnown) || (s === id && tKnown);
    });
    if (!link) return null;
    const s = idOf(link.source);
    const t = idOf(link.target);
    return s === id ? t : s;
  };

  // First pass: group this batch's new nodes by parent, in insertion order
  // (expandKanji already sorts revealed words most-common-first).
  const newSiblingsByParent = new Map();
  const parentOf = new Map();
  for (const id of graph.nodes.keys()) {
    if (simNodesMap.has(id)) {
      seenThisPass.add(id);
      continue;
    }
    const parentId = findParentId(id);
    parentOf.set(id, parentId);
    seenThisPass.add(id);
    if (parentId) {
      if (!newSiblingsByParent.has(parentId)) newSiblingsByParent.set(parentId, []);
      newSiblingsByParent.get(parentId).push(id);
    }
  }

  // Each parent's own origin gives the direction it grew outward; new
  // siblings keep growing that way instead of fanning back over it.
  const anglesByParent = new Map();
  for (const [parentId, siblingIds] of newSiblingsByParent) {
    const parentNode = simNodesMap.get(parentId);
    const originId = state.originParent.get(parentId);
    const originNode = originId ? simNodesMap.get(originId) : null;
    let baseAngle = null;
    let sectorWidth = FULL_CIRCLE;
    if (parentNode && originNode) {
      const dx = parentNode.x - originNode.x;
      const dy = parentNode.y - originNode.y;
      if (Math.hypot(dx, dy) > 1) {
        baseAngle = Math.atan2(dy, dx);
        sectorWidth = outwardSectorWidth(siblingIds.length);
      }
    }
    anglesByParent.set(
      parentId,
      computeSiblingAngles(siblingIds, graph.nodes.get(parentId), graph.nodes, { baseAngle, sectorWidth })
    );
  }

  // A word shared by several kanji sits between them, and each parent
  // link's target distance is pinned to where it actually is, so the
  // midpoint is the physics' own equilibrium rather than a start position
  // it immediately abandons. Null if fewer than 2 parents are placed.
  function pinBridgeWord(wordId, kanjiIds) {
    const positions = Array.from(kanjiIds)
      .map((kid) => [kid, simNodesMap.get(kid)])
      .filter(([, n]) => n);
    if (positions.length < 2) return null;
    const mx = positions.reduce((sum, [, n]) => sum + n.x, 0) / positions.length;
    const my = positions.reduce((sum, [, n]) => sum + n.y, 0) / positions.length;
    for (const [kid, n] of positions) {
      state.linkDistance.set(linkDistanceKey(kid, wordId), Math.hypot(mx - n.x, my - n.y));
    }
    return [mx, my];
  }

  // Second pass: place each new node, spawned at the degree-scaled distance
  // the link force will settle toward, so a big fan-out starts roughly as
  // spread as it'll end up.
  for (const [id, data] of graph.nodes) {
    const prev = simNodesMap.get(id);
    const kanjiParents = kanjiParentsByWord.get(id);

    if (prev) {
      Object.assign(prev, data);
      if (kanjiParents?.size >= 2 && !state.bridgedWords.has(id)) {
        const mid = pinBridgeWord(id, kanjiParents);
        if (mid) {
          [prev.x, prev.y] = mid;
          state.bridgedWords.add(id);
        }
      }
      continue;
    }

    const parentId = parentOf.get(id);
    if (parentId) state.originParent.set(id, parentId);
    const parent = parentId ? simNodesMap.get(parentId) : null;
    let spawnX = width / 2 + (random() - 0.5) * 60;
    let spawnY = height / 2 + (random() - 0.5) * 60;
    const mid = kanjiParents?.size >= 2 ? pinBridgeWord(id, kanjiParents) : null;
    if (mid) {
      [spawnX, spawnY] = mid;
      state.bridgedWords.add(id);
    } else if (parent) {
      const angle = anglesByParent.get(parentId).get(id);
      const spawnRadius = baseLinkDistance(parentDegree.get(parentId) ?? 1);
      spawnX = parent.x + spawnRadius * Math.cos(angle);
      spawnY = parent.y + spawnRadius * Math.sin(angle);
    }
    simNodesMap.set(id, { ...data, x: spawnX, y: spawnY });
  }

  sim.nodes(Array.from(simNodesMap.values()));
  sim.force("link").links(graph.links.map((l) => ({ source: idOf(l.source), target: idOf(l.target) })));
}

/**
 * Lay out a graph the way the explorer does as it's built: `steps` are the
 * successive graphs (the root, then after each expansion). Each step is
 * reconciled and the simulation run to rest before the next, like waiting
 * between clicks. Deterministic: d3-force seeds its own jiggle, and the
 * root's jitter is fixed here. Returns the final node map.
 */
export function layoutGraphSteps(steps, { width = 800, height = 600 } = {}) {
  const state = createLayoutState();
  const sim = createSimulation(state, width, height).stop();
  for (const graph of steps) {
    reconcileLayout(state, sim, graph, width, height, () => 0.5);
    sim.alpha(0.5);
    // The explorer's restart alpha decays to alphaMin in ~270 ticks.
    for (let i = 0; i < 300 && sim.alpha() > sim.alphaMin(); i++) sim.tick();
  }
  return state.nodes;
}
