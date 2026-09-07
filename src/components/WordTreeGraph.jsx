import { useEffect, useRef, useState } from "react";
import { select } from "d3-selection";
import { zoom as d3zoom, zoomIdentity } from "d3-zoom";
import { useForceSimulation } from "../graph/useForceSimulation";
import { nodeRadius, nodeFill, nodeOpacity } from "../graph/layout";
import { readNodeColors } from "../graph/theme";

const DRAG_CLICK_THRESHOLD_PX = 5;
const noStatus = () => undefined;

export default function WordTreeGraph({ graph, selectedId, onNodeClick, getStatus = noStatus }) {
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const gRef = useRef(null);
  const zoomTransformRef = useRef(zoomIdentity);
  const [size, setSize] = useState({ width: 800, height: 600 });

  const { simNodesMapRef } = useForceSimulation(graph, size.width, size.height);

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
    select(svgEl).call(behavior);
    return () => select(svgEl).on(".zoom", null);
  }, []);

  function handleNodePointerDown(e, node) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const svgRect = svgRef.current.getBoundingClientRect();
    const startClient = { x: e.clientX, y: e.clientY };
    let moved = false;
    node.fx = node.x;
    node.fy = node.y;

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
    }

    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      node.fx = null;
      node.fy = null;
      if (!moved) onNodeClick(node.id);
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
  const colors = readNodeColors();

  return (
    <div ref={containerRef} className="graph-container">
      <svg ref={svgRef} width={size.width} height={size.height}>
        <g ref={gRef}>
          <g className="links">
            {graph.links.map((l) => {
              const s = nodesById.get(typeof l.source === "object" ? l.source.id : l.source);
              const t = nodesById.get(typeof l.target === "object" ? l.target.id : l.target);
              if (!s || !t) return null;
              return (
                <line
                  key={`${s.id}->${t.id}`}
                  x1={s.x}
                  y1={s.y}
                  x2={t.x}
                  y2={t.y}
                  className="graph-link"
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
              const opacity = nodeOpacity(getStatus(node.type, itemId));
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
                  <circle r={r} fill={nodeFill(node, { root: node.isRoot, colors })} />
                  {!node.expanded && (
                    <circle r={r + 5} className="graph-node__expand-ring" fill="none" />
                  )}
                  <text textAnchor="middle" dominantBaseline="central" className="graph-node__label">
                    {label}
                  </text>
                </g>
              );
            })}
          </g>
        </g>
      </svg>
    </div>
  );
}
