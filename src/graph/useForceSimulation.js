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

/**
 * Runs a persistent d3-force simulation whose node objects live in a Map
 * (keyed by id) so positions survive when the logical graph grows. Returns
 * a ref to that map; consumers re-render on every simulation tick.
 */
export function useForceSimulation(graph, width, height) {
  const simNodesMapRef = useRef(new Map());
  const simulationRef = useRef(null);
  const [, forceRerender] = useReducer((x) => x + 1, 0);

  // Create the simulation once.
  useEffect(() => {
    const sim = forceSimulation([])
      .force("charge", forceManyBody().strength(-220))
      .force("collide", forceCollide().radius((d) => nodeRadius(d) + 22))
      .force("link", forceLink([]).id((d) => d.id).distance(110).strength(0.5))
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

    // Second pass: place each new node. Siblings revealed together fan out
    // evenly around their parent (a "radial" arrangement, most-common word
    // first) instead of a random jitter that the force simulation then has
    // to violently untangle -- see the reduced restart alpha below, which
    // this calmer starting layout is what makes possible.
    const SPAWN_RADIUS = 100;
    for (const [id, data] of graph.nodes) {
      const prev = simNodesMap.get(id);
      if (prev) {
        Object.assign(prev, data);
        continue;
      }

      const parentId = parentOf.get(id);
      const parent = parentId ? simNodesMap.get(parentId) : null;
      let spawnX = width / 2 + (Math.random() - 0.5) * 60;
      let spawnY = height / 2 + (Math.random() - 0.5) * 60;
      if (parent) {
        const siblings = newSiblingsByParent.get(parentId);
        const angle = (2 * Math.PI * siblings.indexOf(id)) / siblings.length;
        spawnX = parent.x + SPAWN_RADIUS * Math.cos(angle);
        spawnY = parent.y + SPAWN_RADIUS * Math.sin(angle);
      }
      simNodesMap.set(id, { ...data, x: spawnX, y: spawnY });
    }

    const nodesArray = Array.from(simNodesMap.values());
    const linksArray = graph.links.map((l) => ({ source: idOf(l.source), target: idOf(l.target) }));

    sim.nodes(nodesArray);
    sim.force("link").links(linksArray);
    sim.alpha(0.5).restart();
  }, [graph, width, height]);

  return { simNodesMapRef, simulationRef };
}
