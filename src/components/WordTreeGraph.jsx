import { useEffect, useMemo, useRef, useState } from "react";
import { select } from "d3-selection";
import { zoom as d3zoom, zoomIdentity } from "d3-zoom";
import { useForceSimulation } from "../graph/useForceSimulation";
import { nodeRadius, nodeFill, nodeOpacity } from "../graph/layout";
import { readNodeColors } from "../graph/theme";
import { kanjiPositionCategory } from "../graph/positionCategory";

const DRAG_CLICK_THRESHOLD_PX = 5;
const DOUBLE_CLICK_MS = 350;
const noStatus = () => undefined;
const noGroup = () => false;
const noDim = () => false;
const DIMMED_OPACITY = 0.12;
const ZOOM_STEP = 1.3;
// How much of the dragged node's motion its direct neighbors inherit while
// dragging -- 1 would drag the whole cluster as one rigid body (no relative
// motion at all, which reads as glued together rather than linked); this
// keeps them visibly following without losing the spring-like give of the
// link force that's about to take back over once the drag ends.
const NEIGHBOR_FOLLOW = 0.55;

export default function WordTreeGraph({
  graph,
  selectedId,
  onNodeClick,
  onNodeExpand,
  getStatus = noStatus,
  isInGroup = noGroup,
  isDimmed = noDim,
  theme,
}) {
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const gRef = useRef(null);
  const zoomTransformRef = useRef(zoomIdentity);
  const zoomBehaviorRef = useRef(null);
  const lastClickRef = useRef({ id: null, time: 0 });
  const [size, setSize] = useState({ width: 800, height: 600 });

  const { simNodesMapRef, simulationRef } = useForceSimulation(graph, size.width, size.height);

  // Track container size responsively.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Pan + zoom on the background.
  useEffect(() => {
    const svgEl = svgRef.current;
    const gEl = gRef.current;
    if (!svgEl || !gEl) return;
    const behavior = d3zoom()
      .scaleExtent([0.3, 3])
      .filter((event) => !event.target.closest("[data-node]"))
      .on("zoom", (event) => {
        zoomTransformRef.current = event.transform;
        select(gEl).attr("transform", event.transform.toString());
      });
    zoomBehaviorRef.current = behavior;
    select(svgEl).call(behavior);
    return () => select(svgEl).on(".zoom", null);
  }, []);

  // Scroll-to-zoom and drag-to-pan (wired above) work but aren't
  // discoverable on their own -- these give trackpad/mouse users an
  // explicit, visible way to do the same thing.
  function stepZoom(factor) {
    const svgEl = svgRef.current;
    if (!svgEl || !zoomBehaviorRef.current) return;
    select(svgEl).transition().duration(200).call(zoomBehaviorRef.current.scaleBy, factor);
  }

  function resetZoom() {
    const svgEl = svgRef.current;
    if (!svgEl || !zoomBehaviorRef.current) return;
    select(svgEl).transition().duration(200).call(zoomBehaviorRef.current.transform, zoomIdentity);
  }

  function handleNodePointerDown(e, node) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const svgRect = svgRef.current.getBoundingClientRect();
    const startClient = { x: e.clientX, y: e.clientY };
    let moved = false;
    const startX = node.x;
    const startY = node.y;
    node.fx = startX;
    node.fy = startY;

    // Drag pulls the node's direct neighbors along with it too, damped by
    // NEIGHBOR_FOLLOW -- otherwise a dragged node visibly tears away from
    // everything it's linked to before the (much weaker) link force
    // catches up. They're pinned only for the duration of the drag and
    // released at the same moment the dragged node is, so the simulation's
    // own link/charge/collision forces immediately take back over rather
    // than leaving the cluster stuck wherever the drag left it.
    const neighborIds = new Set();
    for (const l of graph.links) {
      const s = typeof l.source === "object" ? l.source.id : l.source;
      const t = typeof l.target === "object" ? l.target.id : l.target;
      if (s === node.id) neighborIds.add(t);
      else if (t === node.id) neighborIds.add(s);
    }
    const neighbors = Array.from(neighborIds)
      .map((id) => simNodesMapRef.current.get(id))
      .filter(Boolean)
      .map((n) => ({ n, startX: n.x, startY: n.y }));

    // A drag on a long-settled graph (alpha decayed to ~0) needs the
    // simulation nudged awake, or nothing re-renders while dragging -- the
    // tick handler is what schedules those re-renders (see
    // useForceSimulation), and it stops firing once alpha bottoms out.
    function wake() {
      const sim = simulationRef.current;
      if (sim) sim.alpha(Math.max(sim.alpha(), 0.3)).restart();
    }
    wake();

    function toLocal(clientX, clientY) {
      const t = zoomTransformRef.current;
      const px = clientX - svgRect.left;
      const py = clientY - svgRect.top;
      return [(px - t.x) / t.k, (py - t.y) / t.k];
    }

    function onMove(ev) {
      const dx = ev.clientX - startClient.x;
      const dy = ev.clientY - startClient.y;
      if (Math.hypot(dx, dy) > DRAG_CLICK_THRESHOLD_PX) moved = true;
      const [lx, ly] = toLocal(ev.clientX, ev.clientY);
      node.fx = lx;
      node.fy = ly;
      const dxTotal = lx - startX;
      const dyTotal = ly - startY;
      for (const { n, startX: nx, startY: ny } of neighbors) {
        n.fx = nx + dxTotal * NEIGHBOR_FOLLOW;
        n.fy = ny + dyTotal * NEIGHBOR_FOLLOW;
      }
      wake();
    }

    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      node.fx = null;
      node.fy = null;
      for (const { n } of neighbors) {
        n.fx = null;
        n.fy = null;
      }
      if (moved) {
        wake();
        return;
      }

      // A click always just selects (shows its definition) -- it never
      // expands on its own, so you can browse without the graph growing
      // out from under you. Expanding is a deliberate second action: a
      // double-click here, or the "Expand" button in the dictionary panel.
      const now = Date.now();
      const isDoubleClick = lastClickRef.current.id === node.id && now - lastClickRef.current.time < DOUBLE_CLICK_MS;
      lastClickRef.current = { id: node.id, time: now };
      onNodeClick(node.id);
      if (isDoubleClick) onNodeExpand?.(node.id);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  // Reading ref.current here is intentional: useForceSimulation's tick
  // handler schedules this exact render, and simNodesMapRef.current is the
  // live physics state (positions mutated in place by d3-force).
  // oxlint-disable-next-line react/refs
  const nodes = Array.from(simNodesMapRef.current.values());
  // oxlint-disable-next-line react/refs
  const nodesById = simNodesMapRef.current;
  // `theme` isn't read directly -- it's a dependency so this recomputes
  // the moment the theme toggles, rather than waiting for some unrelated
  // prop change (selection, expansion) to happen to trigger a re-render.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  const colors = useMemo(() => readNodeColors(), [theme]);

  return (
    <div ref={containerRef} className="graph-container">
      <div className="graph-zoom-controls">
        <button type="button" onClick={() => stepZoom(ZOOM_STEP)} title="Zoom in" aria-label="Zoom in">
          +
        </button>
        <button type="button" onClick={() => stepZoom(1 / ZOOM_STEP)} title="Zoom out" aria-label="Zoom out">
          &minus;
        </button>
        <button type="button" onClick={resetZoom} title="Reset zoom" aria-label="Reset zoom">
          &#8634;
        </button>
      </div>
      <svg ref={svgRef} width={size.width} height={size.height}>
        <g ref={gRef}>
          <g className="links">
            {graph.links.map((l) => {
              const s = nodesById.get(typeof l.source === "object" ? l.source.id : l.source);
              const t = nodesById.get(typeof l.target === "object" ? l.target.id : l.target);
              if (!s || !t) return null;
              // Only a kanji revealing its sibling words (not the reverse --
              // a word revealing its own component kanji) has a meaningful
              // "position" -- see positionCategory.js and useForceSimulation.
              const posCategory = s.type === "kanji" && t.type === "word" ? kanjiPositionCategory(t.word, s.char) : null;
              return (
                <line
                  key={`${s.id}->${t.id}`}
                  x1={s.x}
                  y1={s.y}
                  x2={t.x}
                  y2={t.y}
                  className={`graph-link${posCategory ? ` graph-link--pos-${posCategory}` : ""}`}
                />
              );
            })}
          </g>
          <g className="nodes">
            {nodes.map((node) => {
              const r = nodeRadius(node);
              const selected = node.id === selectedId;
              const label = node.type === "kanji" ? node.char : node.word;
              const itemId = node.type === "kanji" ? node.char : node.word;
              const baseOpacity = nodeOpacity(getStatus(node.type, itemId));
              const dimmed = !node.isRoot && isDimmed(node);
              const opacity = dimmed ? Math.min(baseOpacity, DIMMED_OPACITY) : baseOpacity;
              return (
                <g
                  key={node.id}
                  data-node
                  transform={`translate(${node.x},${node.y})`}
                  onPointerDown={(e) => handleNodePointerDown(e, node)}
                  className={`graph-node graph-node--${node.type}${selected ? " is-selected" : ""}${
                    node.isRoot ? " is-root" : ""
                  }`}
                  style={{ opacity }}
                >
                  <g className="graph-node__pop">
                    {!node.expanded && <title>Double-click to reveal more</title>}
                    <circle r={r} fill={nodeFill(node, { root: node.isRoot, colors })} />
                    {!node.expanded && (
                      <circle r={r + 5} className="graph-node__expand-ring" fill="none" />
                    )}
                    <text textAnchor="middle" dominantBaseline="central" className="graph-node__label">
                      {label}
                    </text>
                    {node.type === "word" && isInGroup(node.word) && (
                      <circle cx={r * 0.68} cy={-r * 0.68} r={4.5} className="graph-node__group-dot" />
                    )}
                  </g>
                </g>
              );
            })}
          </g>
        </g>
      </svg>
    </div>
  );
}
