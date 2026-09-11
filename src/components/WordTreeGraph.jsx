import { useEffect, useMemo, useRef, useState } from "react";
import { select } from "d3-selection";
import { zoom as d3zoom, zoomIdentity } from "d3-zoom";
import { useForceSimulation } from "../graph/useForceSimulation";
import { nodeRadius, nodeFill, nodeOpacity, nodeDetailText, nodeDifficultyColor } from "../graph/layout";
import { readNodeColors } from "../graph/theme";
import { kanjiPositionCategory } from "../graph/positionCategory";
import { linkDistanceKey } from "../graph/linkDistanceKey";
import { kanjiPathColorMap, charOffsetX } from "../graph/kanjiPathColors";

const DRAG_CLICK_THRESHOLD_PX = 5;
const DOUBLE_CLICK_MS = 350;
const noStatus = () => undefined;
const noGroup = () => false;
const noDim = () => false;
const EMPTY_SET = new Set();
const EMPTY_MAP = new Map();
const DIMMED_OPACITY = 0.12;
const ZOOM_STEP = 1.3;
// How much of the dragged node's motion its direct neighbors inherit while
// dragging -- 1 would drag the whole cluster as one rigid body (no relative
// motion at all, which reads as glued together rather than linked); this
// keeps them visibly following without losing the spring-like give of the
// link force that's about to take back over once the drag ends.
const NEIGHBOR_FOLLOW = 0.55;
// Zoom-based level of detail: past DETAIL_ZOOM_ENTER, nodes grow a reading +
// short definition stacked inside the bubble, below the label; below
// DETAIL_ZOOM_EXIT, they drop back to just the word/kanji. The two
// thresholds differ (rather than one shared value) so hovering right at the
// boundary doesn't flicker the detail lines in and out on every minor
// scroll -- you have to cross a small dead zone to flip state, in either
// direction.
const DETAIL_ZOOM_ENTER = 1.6;
const DETAIL_ZOOM_EXIT = 1.3;
// Short enough that a truncated reading/gloss still fits inside the grown
// bubble's chord width at its vertical offset, not just its diameter.
const DETAIL_TEXT_MAX_CHARS = 12;
// How much the bubble grows (in local graph units, so it scales with zoom
// like everything else in the graph) to make room for the extra two lines
// once detailed -- see DETAIL_LABEL_Y/READING_Y/GLOSS_Y below for how
// they're stacked inside it.
const DETAIL_RADIUS_PAD = 15;
const DETAIL_LABEL_Y = -9;
const DETAIL_READING_Y = 6;
const DETAIL_GLOSS_Y = 17;
const DETAIL_GLOSS_Y_NO_READING = 7;
// Assumed per-character advance width for the selected word's label when
// laying out kanji-path identity marks (see KANJI_MARK below) -- Japanese
// text (kanji, hiragana, katakana alike) renders at a consistent
// "full-width" box per the East Asian Width convention, unlike Latin
// text, so treating every character as equal-width is a safe
// simplification here specifically, not a general text-layout hack. Sized
// a little past the label's own 13px font-size for natural tracking.
const KANJI_MARK_GLYPH_W = 15;
const KANJI_MARK_RADIUS = 3;
// Below the label (positive y), not above it -- a small gap past the
// glyph's own bottom edge (~6.5px half-height at the label's 13px font
// size) rather than touching it.
const KANJI_MARK_OFFSET_Y = 10;

function truncate(str, max) {
  return str.length > max ? `${str.slice(0, max - 1).trimEnd()}…` : str;
}

export default function WordTreeGraph({
  graph,
  selectedId,
  onNodeClick,
  onNodeExpand,
  getStatus = noStatus,
  isInGroup = noGroup,
  isDimmed = noDim,
  theme,
  hintedIds = EMPTY_SET,
  colorByDifficulty = false,
  linkColorMode = "off",
  colorByKanjiPath = false,
}) {
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const gRef = useRef(null);
  const zoomTransformRef = useRef(zoomIdentity);
  const zoomBehaviorRef = useRef(null);
  const lastClickRef = useRef({ id: null, time: 0 });
  const [size, setSize] = useState({ width: 800, height: 600 });
  // Mirrors detailTier but read synchronously inside the zoom handler (state
  // updates are async/batched) so repeated zoom events while already past
  // the threshold don't keep calling setDetailTier and scheduling no-op
  // renders every tick.
  const detailTierRef = useRef(false);
  const [detailTier, setDetailTier] = useState(false);

  const { simNodesMapRef, simulationRef, linkDistanceRef } = useForceSimulation(graph, size.width, size.height);

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
        // Labels counter-scale against zoom (see .graph-node__label in
        // App.css) so zooming out to see more of a large graph doesn't
        // shrink text into illegibility -- node/circle sizes still scale
        // normally, only the label stays a constant on-screen size. Set as
        // a CSS var mutated directly here (not React state) so panning/
        // zooming never triggers a re-render of every node just to redraw
        // text at the right size.
        gEl.style.setProperty("--zoom-inv", String(1 / event.transform.k));
        const k = event.transform.k;
        const nowDetailed = detailTierRef.current ? k >= DETAIL_ZOOM_EXIT : k >= DETAIL_ZOOM_ENTER;
        if (nowDetailed !== detailTierRef.current) {
          detailTierRef.current = nowDetailed;
          setDetailTier(nowDetailed);
        }
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

    // Drag pulls the node's CHILDREN along with it too, damped by
    // NEIGHBOR_FOLLOW -- otherwise a dragged hub visibly tears away from
    // everything it's linked to before the (much weaker) link force
    // catches up. They're pinned only for the duration of the drag and
    // released at the same moment the dragged node is, so the simulation's
    // own link/charge/collision forces immediately take back over rather
    // than leaving the cluster stuck wherever the drag left it.
    //
    // Deliberately one-directional -- only children (links where this node
    // is the source, see positionCategory.js's kanji-source convention)
    // follow, never a PARENT. If dragging a word away from its kanji also
    // dragged that kanji along, the two would end up about as close as
    // they started (both having moved the same way), which is exactly the
    // "can't create lasting space from a parent" problem this whole
    // mechanism exists to fix. The parent itself is left alone during the
    // drag, but its distance is still persisted on release below -- only
    // the dragged node moved, so that final distance is exactly what the
    // drag was trying to create.
    const childIds = new Set();
    const parentIds = new Set(); // usually one, but a multi-kanji word can have several
    for (const l of graph.links) {
      const s = typeof l.source === "object" ? l.source.id : l.source;
      const t = typeof l.target === "object" ? l.target.id : l.target;
      if (s === node.id) childIds.add(t);
      else if (t === node.id) parentIds.add(s);
    }
    const children = Array.from(childIds)
      .map((id) => simNodesMapRef.current.get(id))
      .filter(Boolean)
      .map((n) => ({ n, startX: n.x, startY: n.y }));
    const parents = Array.from(parentIds)
      .map((id) => simNodesMapRef.current.get(id))
      .filter(Boolean);

    // A drag on a long-settled graph (alpha decayed to ~0) needs the
    // simulation nudged awake, or nothing re-renders while dragging -- the
    // tick handler is what schedules those re-renders (see
    // useForceSimulation), and it stops firing once alpha bottoms out.
    function wake() {
      const sim = simulationRef.current;
      if (sim) sim.alpha(Math.max(sim.alpha(), 0.3)).restart();
    }
    wake();

    // d3-force's forceLink only evaluates its distance/strength accessors
    // when .links() is (re)assigned -- it caches the results per link for
    // performance rather than re-reading them every tick. So writing a new
    // value into linkDistanceRef alone changes nothing; the link force has
    // to be handed its links again to re-bake against the updated map.
    function rebakeLinkDistances() {
      const sim = simulationRef.current;
      const linkForce = sim?.force("link");
      if (linkForce) linkForce.links(linkForce.links());
    }

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
      for (const { n, startX: nx, startY: ny } of children) {
        n.fx = nx + dxTotal * NEIGHBOR_FOLLOW;
        n.fy = ny + dyTotal * NEIGHBOR_FOLLOW;
      }
      wake();
    }

    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);

      // Read every final position from fx/fy (guaranteed current -- it's
      // exactly what the last pointermove set) before nulling any of them:
      // x/y only catch up to fx/fy on the next simulation tick, so reading
      // x/y here instead could race a drag ending between animation frames.
      // Parents were never pinned, so their x/y (not fx/fy, which is null)
      // is already exactly where they are.
      const finalX = node.fx;
      const finalY = node.fy;
      const childFinals = children.map(({ n }) => ({ n, x: n.fx, y: n.fy }));
      const parentFinals = parents.map((n) => ({ n, x: n.x, y: n.y }));
      node.fx = null;
      node.fy = null;
      for (const { n } of children) {
        n.fx = null;
        n.fy = null;
      }
      if (moved) {
        // Persist the distance this drag left between the node and each of
        // its parents and children as that link's new target -- without
        // this, the link force pulls everything straight back to the
        // degree-based default the instant it's released, which is
        // exactly the "dragging can't create lasting space" problem this
        // is meant to fix.
        for (const { n, x: nx, y: ny } of [...childFinals, ...parentFinals]) {
          linkDistanceRef.current.set(linkDistanceKey(node.id, n.id), Math.hypot(finalX - nx, finalY - ny));
        }
        rebakeLinkDistances();
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

  const selectedNode = nodesById.get(selectedId);
  // Only meaningful when the selection is a word -- a selected kanji has no
  // "component kanji" of its own to fan a path out to. useMemo here is load
  // -bearing, not just tidiness: this component re-renders on every
  // simulation tick, and reconciliation mutates existing node objects in
  // place (see useForceSimulation) rather than replacing them, so
  // `selectedNode`'s reference is stable across ticks unless the selection
  // itself changes -- without the memo, a fresh Map would be allocated
  // every tick regardless.
  const kanjiPathColors = useMemo(
    () =>
      colorByKanjiPath && selectedNode?.type === "word"
        ? kanjiPathColorMap(selectedNode.word, colors.kanjiPath)
        : EMPTY_MAP,
    [colorByKanjiPath, selectedNode, colors]
  );

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
              // "position" or "reading" role -- see positionCategory.js,
              // readingType.js and useForceSimulation. The two are mutually
              // exclusive modes of the same Filters -> "Link coloring"
              // control (see GraphPanel's showReadingLegend/
              // showPositionLegend), never stacked.
              const isKanjiToWord = s.type === "kanji" && t.type === "word";
              const readingCategory =
                linkColorMode === "reading" && isKanjiToWord ? (t.kanjiReadingTypes?.[s.char] ?? "unknown") : null;
              const posCategory =
                linkColorMode === "position" && isKanjiToWord ? kanjiPositionCategory(t.word, s.char) : null;
              const linkClass = readingCategory
                ? ` graph-link--reading-${readingCategory}`
                : posCategory
                  ? ` graph-link--pos-${posCategory}`
                  : "";
              // A word<->kanji link can point either way depending on which
              // side was expanded first (expandWord: word->kanji;
              // expandKanji: kanji->word -- see graph/buildGraph.js), so
              // this checks both directions rather than assuming
              // isKanjiToWord's kanji-reveals-word orientation. Wins over
              // linkClass above via inline style (set below), not by
              // fighting it for a class name.
              const pathChar =
                colorByKanjiPath && s.id === selectedId && t.type === "kanji" && kanjiPathColors.has(t.char)
                  ? t.char
                  : colorByKanjiPath && t.id === selectedId && s.type === "kanji" && kanjiPathColors.has(s.char)
                    ? s.char
                    : null;
              const pathColor = pathChar ? kanjiPathColors.get(pathChar) : null;
              return (
                <line
                  key={`${s.id}->${t.id}`}
                  x1={s.x}
                  y1={s.y}
                  x2={t.x}
                  y2={t.y}
                  vectorEffect="non-scaling-stroke"
                  className={`graph-link${linkClass}${pathColor ? " graph-link--kanji-path" : ""}`}
                  style={pathColor ? { stroke: pathColor } : undefined}
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
              // The root already carries --accent as its whole identity --
              // a ring on top of that would compete with, not add to, its
              // one job of reading as "the mark." Everything else gets one
              // if it has a bucket to show (see buildGraph.js's
              // jlptBucket) and the Filters toggle is on.
              const showDifficulty = colorByDifficulty && !node.isRoot && Boolean(node.jlptBucket);
              // Kanji-path highlight wins the same ring channel when both
              // are active on the same node -- it's the actively-selected
              // path, so it should read as "more current" than a static
              // difficulty indicator, not stack a second ring alongside it.
              const pathRingColor = node.type === "kanji" ? kanjiPathColors.get(node.char) : null;
              const ringColor = pathRingColor ?? (showDifficulty ? nodeDifficultyColor(node, colors) : null);
              // Only computed when detailTier is on -- this render runs on
              // every simulation tick, so doing this unconditionally would
              // mean parsing reading/gloss for every node on every frame
              // even when nothing is ever going to show it.
              const { reading, gloss } = detailTier ? nodeDetailText(node) : { reading: "", gloss: "" };
              const hasDetail = detailTier && (reading || gloss);
              // Marks sit below the label, and hasDetail already stacks a
              // reading + gloss line down there -- rather than push marks
              // even further down (extending past the bubble's own
              // detail-tier padding), they just don't show once there's
              // more detail on screen than the label alone.
              const showKanjiMarks = selected && node.type === "word" && !hasDetail && kanjiPathColors.size > 0;
              const labelChars = showKanjiMarks ? Array.from(label) : null;
              // The bubble itself grows to hold the extra two lines rather
              // than spilling them outside its edge -- displayR (not r)
              // drives everything drawn against this node from here down.
              const displayR = hasDetail ? r + DETAIL_RADIUS_PAD : r;
              return (
                <g
                  key={node.id}
                  data-node
                  transform={`translate(${node.x},${node.y})`}
                  onPointerDown={(e) => handleNodePointerDown(e, node)}
                  className={`graph-node graph-node--${node.type}${selected ? " is-selected" : ""}${
                    node.isRoot ? " is-root" : ""
                  }${hintedIds.has(node.id) ? " graph-node--hint" : ""}${ringColor ? " graph-node--ring" : ""}${
                    pathRingColor ? " graph-node--kanji-path-target" : ""
                  }`}
                  style={ringColor ? { opacity, "--node-ring-stroke": ringColor } : { opacity }}
                >
                  <g className="graph-node__pop">
                    {!node.expanded && <title>Double-click to reveal more</title>}
                    {/* Selection is a soft blurred glow behind the node
                        rather than an outline ring -- a real Gaussian blur
                        (CSS filter, not a radial-gradient falloff), so it
                        reads as a soft bloom instead of a flat tinted
                        disc. Sized close to the node (not a large fixed
                        pad) so it stays a "backlit" glow around THIS node
                        rather than ballooning out far enough to visibly
                        tint a neighboring link line. Drawn first so
                        everything else (fill, rings, label) paints over
                        it; pointer-events: none keeps its larger, blurred
                        circle from enlarging the node's actual click
                        target. */}
                    {selected && (
                      <circle r={displayR * 1.35} className="graph-node__select-glow" pointerEvents="none" />
                    )}
                    <circle
                      r={displayR}
                      className="graph-node__fill"
                      fill={nodeFill(node, { root: node.isRoot, colors })}
                      vectorEffect="non-scaling-stroke"
                    />
                    {!node.expanded && (
                      <circle
                        r={displayR + 5}
                        className="graph-node__expand-ring"
                        fill="none"
                        vectorEffect="non-scaling-stroke"
                      />
                    )}
                    {/* Deliberately always plain white glyph fill, even
                        for a kanji-path-highlighted selection -- an
                        earlier version recolored each kanji glyph itself,
                        but that put the color directly on top of the
                        node's own fill (--accent or --node-word), and
                        measured contrast there was ~1-2:1 for every
                        kanji-path hue against either -- effectively
                        unreadable. Instead, when this word is selected and
                        kanji-path highlighting is on, each kanji gets a
                        small solid-colored dot below it (see
                        graph-node__kanji-mark below), same idea as the
                        existing group-membership dot: a background-
                        colored ring cuts a crisp edge around the fill
                        regardless of what it's sitting on, so the dot
                        doesn't need to independently clear a contrast bar
                        against the node's own fill the way text would.
                        Laid out with explicit per-character x
                        (KANJI_MARK_GLYPH_W) rather than letting the string
                        flow normally, so each mark's position is computed
                        from the exact same model as the characters it
                        points at instead of trying to measure real
                        rendered glyph positions. */}
                    <text
                      textAnchor="middle"
                      dominantBaseline="central"
                      y={hasDetail ? DETAIL_LABEL_Y : 0}
                      className="graph-node__label"
                      style={{ transform: "scale(var(--zoom-inv, 1))" }}
                    >
                      {showKanjiMarks
                        ? labelChars.map((ch, i) => (
                            <tspan key={i} x={charOffsetX(i, labelChars.length, KANJI_MARK_GLYPH_W)}>
                              {ch}
                            </tspan>
                          ))
                        : label}
                    </text>
                    {showKanjiMarks && (
                      <g style={{ transform: "scale(var(--zoom-inv, 1))" }}>
                        {labelChars.map((ch, i) => {
                          const markColor = kanjiPathColors.get(ch);
                          if (!markColor) return null;
                          return (
                            <circle
                              key={i}
                              className="graph-node__kanji-mark"
                              cx={charOffsetX(i, labelChars.length, KANJI_MARK_GLYPH_W)}
                              cy={KANJI_MARK_OFFSET_Y}
                              r={KANJI_MARK_RADIUS}
                              style={{ fill: markColor }}
                            />
                          );
                        })}
                      </g>
                    )}
                    {hasDetail && (
                      <>
                        {reading && (
                          <text textAnchor="middle" y={DETAIL_READING_Y} className="graph-node__detail">
                            {truncate(reading, DETAIL_TEXT_MAX_CHARS)}
                          </text>
                        )}
                        {gloss && (
                          <text
                            textAnchor="middle"
                            y={reading ? DETAIL_GLOSS_Y : DETAIL_GLOSS_Y_NO_READING}
                            className="graph-node__detail graph-node__detail--gloss"
                          >
                            {truncate(gloss, DETAIL_TEXT_MAX_CHARS)}
                          </text>
                        )}
                      </>
                    )}
                    {node.type === "word" && isInGroup(node.word) && (
                      <circle cx={displayR * 0.68} cy={-displayR * 0.68} r={4.5} className="graph-node__group-dot" />
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
