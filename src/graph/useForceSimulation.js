import { useEffect, useReducer, useRef } from "react";
import { createLayoutState, createSimulation, reconcileLayout, setSimulationSize } from "./forceLayout";

/**
 * Runs a persistent d3-force simulation whose node objects live in a Map
 * (keyed by id) so positions survive when the logical graph grows. Returns
 * a ref to that map; consumers re-render on every simulation tick. The
 * forces and node placement themselves live in forceLayout.js, shared with
 * the server-rendered graph previews on the kanji and word pages.
 */
export function useForceSimulation(graph, width, height, active = true) {
  const stateRef = useRef(null);
  stateRef.current ??= createLayoutState();
  const state = stateRef.current;
  // Stable for the component's lifetime (the Maps are never replaced), so
  // consumers can hold these refs the way they always have. linkDistance
  // is where WordTreeGraph's drag handler records a user-dragged distance
  // that overrides the degree-based default.
  const simNodesMapRef = useRef(state.nodes);
  const linkDistanceRef = useRef(state.linkDistance);
  const simulationRef = useRef(null);
  const [, forceRerender] = useReducer((x) => x + 1, 0);

  // While the graph is hidden (the phone layout's collapsed Explore pane),
  // physics keeps running -- so positions are settled and correct the
  // moment it's shown -- but the per-tick React re-render, the expensive
  // part, is skipped. One catch-up render when it becomes visible again.
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
    if (active) forceRerender();
  }, [active]);

  // Create the simulation once.
  useEffect(() => {
    const sim = createSimulation(state, width, height).on("tick", () => {
      if (activeRef.current) forceRerender();
    });
    simulationRef.current = sim;
    return () => sim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the centering forces in sync with container size.
  useEffect(() => {
    const sim = simulationRef.current;
    if (!sim) return;
    setSimulationSize(sim, width, height);
    sim.alpha(Math.max(sim.alpha(), 0.1)).restart();
  }, [width, height]);

  // Reconcile the logical graph into the physics simulation whenever it
  // changes, preserving existing positions. The calm, fanned-out starting
  // layout (see reconcileLayout) is what lets this restart at a modest
  // alpha instead of violently untangling random spawn points.
  useEffect(() => {
    const sim = simulationRef.current;
    if (!sim) return;
    reconcileLayout(state, sim, graph, width, height);
    sim.alpha(0.5).restart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, width, height]);

  return { simNodesMapRef, simulationRef, linkDistanceRef };
}
