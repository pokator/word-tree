import { useEffect, useReducer, useRef } from "react";
import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCollide,
  forceX,
  forceY,
} from "d3-force";
import { nodeRadius } from "./layout";
import { kanjiPositionCategory, POSITION_ORDER } from "./positionCategory";
import { linkDistanceKey } from "./linkDistanceKey";

// A hub with many revealed siblings needs a bigger ring than one with just
// two or three -- a flat distance packs a 20-word fan-out into the same
// circumference as a 3-word one, which is exactly the "kanji blur into each
// other" crowding this scales away from. Below DENSE_THRESHOLD siblings this
// is just the flat base distance (unchanged from before); past it, distance
// grows with sibling count so the arc length between neighbors stays roughly
// proportional to how many have to fit on the ring.
const BASE_LINK_DISTANCE = 110;
const DENSE_THRESHOLD = 4;
const DISTANCE_PER_EXTRA_SIBLING = 14;

export function baseLinkDistance(siblingCount) {
  return BASE_LINK_DISTANCE + Math.max(0, siblingCount - DENSE_THRESHOLD) * DISTANCE_PER_EXTRA_SIBLING;
}

// Assigns each new sibling an angle around its parent. When the parent is a
// kanji, siblings are first grouped by kanjiPositionCategory and each group
// gets a contiguous angular sector sized proportionally to its member
// count (so e.g. an all-"start" batch just fills the whole circle exactly
// like before, and a mixed batch visually clusters by role instead of
// interleaving them by rank). A non-kanji parent (a word revealing its own
// component kanji) just spaces its siblings evenly -- there's no
// analogous "position" grouping for that direction.
function computeSiblingAngles(siblingIds, parentData, graphNodes) {
  const angleById = new Map();
  const total = siblingIds.length;
  if (total === 0) return angleById;

  if (parentData?.type === "kanji") {
    const buckets = { start: [], middle: [], end: [] };
    for (const id of siblingIds) {
      const word = graphNodes.get(id)?.word ?? "";
      buckets[kanjiPositionCategory(word, parentData.char)].push(id);
    }
    let cursor = 0;
    for (const cat of POSITION_ORDER) {
      const group = buckets[cat];
      if (group.length === 0) continue;
      const sectorSize = (2 * Math.PI * group.length) / total;
      group.forEach((id, i) => {
        angleById.set(id, cursor + (sectorSize * (i + 0.5)) / group.length);
      });
      cursor += sectorSize;
    }
    return angleById;
  }

  siblingIds.forEach((id, i) => angleById.set(id, (2 * Math.PI * i) / total));
  return angleById;
}

/**
 * Runs a persistent d3-force simulation whose node objects live in a Map
 * (keyed by id) so positions survive when the logical graph grows. Returns
 * a ref to that map; consumers re-render on every simulation tick.
 */
export function useForceSimulation(graph, width, height) {
  const simNodesMapRef = useRef(new Map());
  const simulationRef = useRef(null);
  // parentId -> sibling count sharing that parent, recomputed whenever the
  // graph's links change (see the reconciliation effect below) -- read by
  // the link force's distance accessor so hub spacing scales with fan-out.
  const parentDegreeRef = useRef(new Map());
  // linkDistanceKey(a,b) -> a user-dragged distance override (see
  // WordTreeGraph's drag handler) that takes precedence over the
  // degree-based default -- this is what makes dragging a node away from
  // its parent an actual, persistent way to create room, instead of the
  // link force pulling it straight back once the drag ends.
  const linkDistanceRef = useRef(new Map());
  // Word ids already snapped to sit between their kanji parents (see the
  // reconciliation effect below) -- a one-time nudge per word, not a
  // standing constraint, so it doesn't keep fighting a user's own drag.
  const bridgedWordsRef = useRef(new Set());
  const [, forceRerender] = useReducer((x) => x + 1, 0);

  // Create the simulation once.
  useEffect(() => {
    const idOf = (endpoint) => (typeof endpoint === "object" ? endpoint.id : endpoint);
    const sim = forceSimulation([])
      .force("charge", forceManyBody().strength(-240))
      .force(
        "collide",
        forceCollide().radius((d) => nodeRadius(d) + (d.type === "kanji" ? 30 : 20))
      )
      .force(
        "link",
        forceLink([])
          .id((d) => d.id)
          .distance((l) => {
            const key = linkDistanceKey(idOf(l.source), idOf(l.target));
            const custom = linkDistanceRef.current.get(key);
            if (custom !== undefined) return custom;
            const degree = parentDegreeRef.current.get(idOf(l.source)) ?? 1;
            return baseLinkDistance(degree);
          })
          .strength(0.5)
      )
      .force("x", forceX(width / 2).strength(0.03))
      .force("y", forceY(height / 2).strength(0.03))
      .on("tick", forceRerender);
    simulationRef.current = sim;
    return () => sim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the centering forces in sync with container size.
  useEffect(() => {
    const sim = simulationRef.current;
    if (!sim) return;
    sim.force("x", forceX(width / 2).strength(0.03));
    sim.force("y", forceY(height / 2).strength(0.03));
    sim.alpha(Math.max(sim.alpha(), 0.1)).restart();
  }, [width, height]);

  // Reconcile the logical graph (nodes/links Map+Array) into the physics
  // simulation whenever it changes, preserving existing positions.
  useEffect(() => {
    const sim = simulationRef.current;
    if (!sim) return;
    const simNodesMap = simNodesMapRef.current;

    for (const id of Array.from(simNodesMap.keys())) {
      if (!graph.nodes.has(id)) simNodesMap.delete(id);
    }

    const idOf = (endpoint) => (typeof endpoint === "object" ? endpoint.id : endpoint);

    // Recomputed from scratch each time since it's cheap (one pass over the
    // links) and needs to reflect every link, not just this batch's new
    // ones -- a hub revealed across several "show more" batches needs its
    // ring sized for its TOTAL sibling count, not just the latest addition.
    // wordId -> Set(kanjiId) for every kanji that reveals this word -- most
    // words have exactly one, but a word built from several kanji (e.g. 日本
    // from 日 and 本) can end up linked from each of them separately, once
    // each kanji has been expanded. Used below both for parentDegree (a
    // kanji's fan-out size) and to detect these multi-parent "bridge" words.
    const kanjiParentsByWord = new Map();
    for (const l of graph.links) {
      const s = idOf(l.source);
      const t = idOf(l.target);
      if (graph.nodes.get(s)?.type === "kanji") {
        if (!kanjiParentsByWord.has(t)) kanjiParentsByWord.set(t, new Set());
        kanjiParentsByWord.get(t).add(s);
      }
    }

    const parentDegree = new Map();
    for (const l of graph.links) {
      const s = idOf(l.source);
      if (graph.nodes.get(s)?.type === "kanji") {
        parentDegree.set(s, (parentDegree.get(s) ?? 0) + 1);
      }
    }
    parentDegreeRef.current = parentDegree;

    const findParentId = (id) => {
      const link = graph.links.find((l) => {
        const s = idOf(l.source);
        const t = idOf(l.target);
        return (t === id && simNodesMap.has(s)) || (s === id && simNodesMap.has(t));
      });
      if (!link) return null;
      const s = idOf(link.source);
      const t = idOf(link.target);
      return s === id ? t : s;
    };

    // First pass: group this batch's new nodes by parent, in the order
    // they appear in `graph.nodes` (insertion order -- expandKanji already
    // sorts revealed words most-common-first, so that ordering is
    // preserved straight through into the layout below).
    const newSiblingsByParent = new Map(); // parentId -> [newNodeId, ...]
    const parentOf = new Map(); // newNodeId -> parentId | null
    for (const id of graph.nodes.keys()) {
      if (simNodesMap.has(id)) continue;
      const parentId = findParentId(id);
      parentOf.set(id, parentId);
      if (parentId) {
        if (!newSiblingsByParent.has(parentId)) newSiblingsByParent.set(parentId, []);
        newSiblingsByParent.get(parentId).push(id);
      }
    }

    // Precompute each parent's sibling angles once (not per-node) since
    // computeSiblingAngles needs the whole group to size sectors.
    const anglesByParent = new Map(); // parentId -> Map(siblingId -> angle)
    for (const [parentId, siblingIds] of newSiblingsByParent) {
      anglesByParent.set(parentId, computeSiblingAngles(siblingIds, graph.nodes.get(parentId), graph.nodes));
    }

    // A word shared by several kanji (e.g. 日本, once both 日 and 本 have
    // been separately expanded) should sit between them, representing that
    // shared relationship -- not hang off whichever kanji happened to
    // reveal it first while a second, distant link to it stretches across
    // the graph. A one-time position snap alone doesn't hold: each link's
    // distance force still independently pulls toward that PARENT's own
    // full hub-ring distance, and since that's normally bigger than half
    // the gap between the two kanji, the word gets stretched right back
    // out to one side (equidistant from both, but off the line between
    // them, not sitting on it). So this also pins each parent link's own
    // target distance to the word's actual current distance from that
    // parent -- with both links agreeing on "however far the midpoint
    // currently is," the midpoint becomes the equilibrium the physics
    // itself wants, not just a starting position it immediately abandons.
    // Returns null if fewer than 2 of its kanji parents are actually
    // placed yet (nothing to average).
    function pinBridgeWord(wordId, kanjiIds) {
      const positions = Array.from(kanjiIds)
        .map((kid) => [kid, simNodesMap.get(kid)])
        .filter(([, n]) => n);
      if (positions.length < 2) return null;
      const mx = positions.reduce((sum, [, n]) => sum + n.x, 0) / positions.length;
      const my = positions.reduce((sum, [, n]) => sum + n.y, 0) / positions.length;
      for (const [kid, n] of positions) {
        linkDistanceRef.current.set(linkDistanceKey(kid, wordId), Math.hypot(mx - n.x, my - n.y));
      }
      return [mx, my];
    }

    // Second pass: place each new node. Siblings revealed together fan out
    // around their parent (grouped by role, see computeSiblingAngles)
    // instead of a random jitter that the force simulation then has to
    // violently untangle -- see the reduced restart alpha below, which
    // this calmer starting layout is what makes possible. The spawn radius
    // uses the same degree-scaled distance the link force will settle
    // toward (see baseLinkDistance above), so a big fan-out starts out
    // already roughly as spread as it'll end up, rather than spawning
    // tight and visibly shoving itself apart after the fact.
    for (const [id, data] of graph.nodes) {
      const prev = simNodesMap.get(id);
      const kanjiParents = kanjiParentsByWord.get(id);

      if (prev) {
        Object.assign(prev, data);
        // This word just gained a second (or later) kanji parent -- snap it
        // to sit between them once, rather than leaving it wherever it
        // spawned relative to only the first. Not repeated on every later
        // graph change (bridgedWordsRef), so it doesn't fight a user's own
        // drag of this node afterward.
        if (kanjiParents?.size >= 2 && !bridgedWordsRef.current.has(id)) {
          const mid = pinBridgeWord(id, kanjiParents);
          if (mid) {
            [prev.x, prev.y] = mid;
            bridgedWordsRef.current.add(id);
          }
        }
        continue;
      }

      const parentId = parentOf.get(id);
      const parent = parentId ? simNodesMap.get(parentId) : null;
      let spawnX = width / 2 + (Math.random() - 0.5) * 60;
      let spawnY = height / 2 + (Math.random() - 0.5) * 60;
      const mid = kanjiParents?.size >= 2 ? pinBridgeWord(id, kanjiParents) : null;
      if (mid) {
        [spawnX, spawnY] = mid;
        bridgedWordsRef.current.add(id);
      } else if (parent) {
        const angle = anglesByParent.get(parentId).get(id);
        const spawnRadius = baseLinkDistance(parentDegree.get(parentId) ?? 1);
        spawnX = parent.x + spawnRadius * Math.cos(angle);
        spawnY = parent.y + spawnRadius * Math.sin(angle);
      }
      simNodesMap.set(id, { ...data, x: spawnX, y: spawnY });
    }

    const nodesArray = Array.from(simNodesMap.values());
    const linksArray = graph.links.map((l) => ({ source: idOf(l.source), target: idOf(l.target) }));

    sim.nodes(nodesArray);
    sim.force("link").links(linksArray);
    sim.alpha(0.5).restart();
  }, [graph, width, height]);

  return { simNodesMapRef, simulationRef, linkDistanceRef };
}
