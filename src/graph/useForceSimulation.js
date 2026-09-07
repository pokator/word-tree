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
      .force("charge", forceManyBody().strength(-320))
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

    for (const [id, data] of graph.nodes) {
      const prev = simNodesMap.get(id);
      if (prev) {
        Object.assign(prev, data);
        continue;
      }

      let spawnX = width / 2 + (Math.random() - 0.5) * 60;
      let spawnY = height / 2 + (Math.random() - 0.5) * 60;
      const parentLink = graph.links.find((l) => {
        const s = idOf(l.source);
        const t = idOf(l.target);
        return (t === id && simNodesMap.has(s)) || (s === id && simNodesMap.has(t));
      });
      if (parentLink) {
        const s = idOf(parentLink.source);
        const t = idOf(parentLink.target);
        const parent = simNodesMap.get(s === id ? t : s);
        if (parent) {
          spawnX = parent.x + (Math.random() - 0.5) * 50;
          spawnY = parent.y + (Math.random() - 0.5) * 50;
        }
      }
      simNodesMap.set(id, { ...data, x: spawnX, y: spawnY });
    }

    const nodesArray = Array.from(simNodesMap.values());
    const linksArray = graph.links.map((l) => ({ source: idOf(l.source), target: idOf(l.target) }));

    sim.nodes(nodesArray);
    sim.force("link").links(linksArray);
    sim.alpha(0.8).restart();
  }, [graph, width, height]);

  return { simNodesMapRef, simulationRef };
}
