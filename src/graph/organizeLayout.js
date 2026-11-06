// The Organize button: a whole new layout for the graph, worked out from its
// shape rather than from how it happened to grow. The physics in forceLayout.js
// is good at fanning out one expansion, but it can only use the room left by
// earlier ones, so clusters sink into each other as a graph grows.
//
//  1. Spanning tree from the root. A word with nothing of its own beyond it,
//     bridging nodes that have branches, is "shared": it floats free of the tree.
//  2. Balloon layout: every node's subtree gets its own circle, fanned around
//     it, so one cluster can't sink into another.
//  3. Siblings are ordered so nodes joined by a shared word or a cross link end
//     up side by side, keeping those lines short.
//  4. Each branch is pulled in towards its parent as far as it'll go. Those
//     circles are generous: one big branch would otherwise push all its
//     siblings far out, and a graph that's too spread out has to be zoomed out.
//  5. Shared words go between the nodes they connect.
//  6. A last pass fits the viewport's shape, separates anything still too close
//     and moves nodes off lines that aren't theirs.
//
// Sizes allow for labels, which keep their on-screen size while the bubbles
// shrink with zoom. Deterministic: the same graph always organizes the same way.
import { CENTER_Y_BIAS } from "./forceLayout.js";
import { nodeRadius } from "./layout.js";

const EXPAND_RING = 5;
const NODE_GAP = 12;
const LABEL_PX_PER_CHAR = 13;
const KANJI_LABEL_PX = 17;
const LABEL_PAD = 8;
// How far zoomed out to allow for when sizing labels; past this a graph is too
// big for the labels to fit however it's arranged.
const MIN_PLANNED_ZOOM = 0.6;
const VIEW_PAD = 80;

const MIN_LINK_LENGTH = 96;
const FAN_SPAN = (230 * Math.PI) / 180;
const FULL_CIRCLE = Math.PI * 2;
const FAN_TWO_RINGS = 12;
const FAN_THREE_RINGS = 26;
const RING_GAP = 0.8;
const RING_SHARE = 0.75;
const BRIDGED_ROOT_SPAN = (150 * Math.PI) / 180;
const ORDER_PASSES = 3;
const MAX_ORDER_TRIES = 120;
const RELAX_PASSES = 140;
const LINE_CLEARANCE = 6;
const OFF_LINE_STEP = 16;
const OFF_LINE_TRIES = 16;
const MIN_ASPECT_SQUEEZE = 0.72;
const COMPACT_PASSES = 3;
const COMPACT_STEP = 0.92;
const MIN_COMPACT_MOVE = 0.5;
const SHARED_WORD_ROOM = 1.2;
const MAX_STACK_ROOM = 3;
const stackColumns = (count) => (count > STACK_THREE_COLUMNS ? 3 : count > STACK_TWO_COLUMNS ? 2 : 1);
const STACK_TWO_COLUMNS = 6;
const STACK_THREE_COLUMNS = 15;
const MAX_STACK_NUDGE = 6;
// Past this a graph is always zoomed out, so there's no need to arrange it once
// just to find that out.
const ALWAYS_ZOOMED_NODES = 60;
// Too small to need fitting to the viewport.
const ASPECT_MIN_NODES = 10;

// This all runs in the click, and its cost climbs steeply with size, so very big
// graphs (only reachable with a high words-per-branch) get less polish, not a
// frozen page. By size rather than a time budget, to stay deterministic.
function effortFor(nodeCount) {
  if (nodeCount <= 150) return { swaps: MAX_ORDER_TRIES, compact: COMPACT_PASSES, relax: RELAX_PASSES };
  if (nodeCount <= 400) return { swaps: 10, compact: 1, relax: 30 };
  return { swaps: 0, compact: 0, relax: 8 };
}

const idOf = (endpoint) => (typeof endpoint === "object" ? endpoint.id : endpoint);

function labelWidth(node) {
  if (node.type === "kanji") return KANJI_LABEL_PX;
  return [...(node.word ?? "")].length * LABEL_PX_PER_CHAR;
}

/** The width a node needs to itself: its bubble, or its label if that's wider. */
function footprint(node, labelScale) {
  const bubble = 2 * (nodeRadius(node) + EXPAND_RING);
  return Math.max(bubble, (labelWidth(node) + LABEL_PAD) * labelScale) + NODE_GAP;
}

function adjacencyOf(graph) {
  const adj = new Map([...graph.nodes.keys()].map((id) => [id, new Set()]));
  for (const l of graph.links) {
    const s = idOf(l.source);
    const t = idOf(l.target);
    if (s !== t && adj.has(s) && adj.has(t)) {
      adj.get(s).add(t);
      adj.get(t).add(s);
    }
  }
  return adj;
}

/** Breadth-first from the root, in insertion order; anything unreachable hangs off the root. */
function spanningTree(graph, adj) {
  const ids = [...graph.nodes.keys()];
  const rootId = ids.find((id) => graph.nodes.get(id).isRoot) ?? ids[0];
  const children = new Map(ids.map((id) => [id, []]));
  const seen = new Set([rootId]);
  const queue = [rootId];
  const walk = () => {
    while (queue.length) {
      const id = queue.shift();
      for (const next of adj.get(id)) {
        if (seen.has(next)) continue;
        seen.add(next);
        children.get(id).push(next);
        queue.push(next);
      }
    }
  };
  walk();
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    children.get(rootId).push(id);
    queue.push(id);
    walk();
  }
  return { rootId, children };
}

/** Leaves bridging two or more nodes that have branches of their own: they float between those nodes instead. */
function liftSharedWords(rootId, children, adj) {
  const shared = new Set();
  const branches = (id) => children.get(id).length > 0;
  for (const [id, kids] of children) {
    if (id !== rootId && kids.length === 0 && [...adj.get(id)].filter(branches).length >= 2) shared.add(id);
  }
  for (const [id, kids] of children) {
    children.set(
      id,
      kids.filter((kid) => !shared.has(kid))
    );
  }
  return shared;
}

function subtreeOf(id, children, into = new Set()) {
  into.add(id);
  for (const kid of children.get(id)) subtreeOf(kid, children, into);
  return into;
}

/** How many staggered rings a fan of `count` children spreads over. */
const ringsFor = (count) => (count > FAN_THREE_RINGS ? 3 : count > FAN_TWO_RINGS ? 2 : 1);
const isLeaf = (id, children) => children.get(id).length === 0;
// A little more than an even share of the circle, so a line to an outer ring
// clears the inner neighbours it passes between.
const ringShare = (rings) => (rings === 1 ? 1 : rings * RING_SHARE);

/**
 * Each subtree's circle: `radius` around the node, its children at `dist`. A big
 * fan's leaves take turns between rings, each giving the next ring's line room
 * to pass, so they need that much less of the circle.
 */
function measure(id, rootId, rootSpan, children, foot, sizes) {
  const kids = children.get(id);
  for (const kid of kids) measure(kid, rootId, rootSpan, children, foot, sizes);
  const own = foot(id) / 2;
  if (kids.length === 0) {
    sizes.set(id, { radius: own, dist: 0 });
    return;
  }
  const span = id === rootId ? rootSpan : FAN_SPAN;
  const rings = ringsFor(kids.length);
  const radii = kids.map((kid) => sizes.get(kid).radius / (isLeaf(kid, children) ? ringShare(rings) : 1));
  const largest = Math.max(...kids.map((kid) => sizes.get(kid).radius));
  const fits = (d) => radii.reduce((sum, r) => sum + 2 * Math.asin(Math.min(1, r / d)), 0) <= span;
  let low = Math.max(MIN_LINK_LENGTH, own + largest);
  let high = low;
  while (!fits(high)) high *= 1.5;
  if (!fits(low)) {
    for (let i = 0; i < 24; i++) {
      const mid = (low + high) / 2;
      if (fits(mid)) high = mid;
      else low = mid;
    }
    low = high;
  }
  const ringGap = rings > 1 ? 2 * largest * RING_GAP : 0;
  sizes.set(id, { radius: Math.max(own, low + (rings - 1) * ringGap + largest), dist: low, rings, ringGap });
}

/** Fans each node's children around it, opening away from where it came from. */
function place(id, x, y, direction, rootId, rootSpan, children, sizes, positions) {
  positions.set(id, { x, y });
  const kids = children.get(id);
  if (kids.length === 0) return;
  const { dist, rings, ringGap } = sizes.get(id);
  const span = id === rootId ? rootSpan : FAN_SPAN;
  const angles = kids.map((kid) => {
    const r = sizes.get(kid).radius / (isLeaf(kid, children) ? ringShare(rings) : 1);
    return 2 * Math.asin(Math.min(1, r / dist));
  });
  const used = angles.reduce((a, b) => a + b, 0);
  const slack = (span - used) / kids.length;
  let cursor = direction - span / 2;
  kids.forEach((kid, i) => {
    const angle = cursor + (angles[i] + slack) / 2;
    cursor += angles[i] + slack;
    const out = dist + (isLeaf(kid, children) ? (i % rings) * ringGap : 0);
    place(kid, x + out * Math.cos(angle), y + out * Math.sin(angle), angle, rootId, rootSpan, children, sizes, positions);
  });
}

function pointSegmentDistance(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return { dist: Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y), cx: a.x + t * dx, cy: a.y + t * dy };
}

/** Puts each shared word between the nodes it connects, spreading any that share the same ones. */
function placeSharedWords(shared, adj, positions, foot) {
  const groups = new Map();
  for (const id of shared) {
    const names = [...adj.get(id)].filter((n) => positions.has(n)).sort();
    const key = JSON.stringify(names);
    if (!groups.has(key)) groups.set(key, { names, ids: [] });
    groups.get(key).ids.push(id);
  }
  for (const { names, ids } of groups.values()) {
    const anchors = names.map((n) => positions.get(n));
    const cx = anchors.reduce((sum, p) => sum + p.x, 0) / anchors.length;
    const cy = anchors.reduce((sum, p) => sum + p.y, 0) / anchors.length;
    const a = anchors[0];
    const b = anchors[anchors.length - 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    // A stack across the line between its anchors, in columns once it's long,
    // so it can't push the graph far apart. Centered between them if there's
    // room, and otherwise as near the middle as there is. If that line is a real
    // link, the stack goes either side of it instead of on it.
    const step = Math.max(...ids.map(foot));
    const linked = names.length === 2 && adj.get(names[0]).has(names[1]);
    const columns = stackColumns(ids.length);
    const rows = Math.ceil(ids.length / columns);
    const spot = (i, nudge) => {
      const row = Math.floor(i / columns);
      const across = linked ? (row % 2 ? -1 : 1) * (0.75 + Math.floor(row / 2)) : row - (rows - 1) / 2;
      const along = (i % columns) - (columns - 1) / 2;
      const offset = step * (across + nudge);
      return { x: cx + nx * offset + ny * step * along, y: cy + ny * offset - nx * step * along };
    };
    const isClear = (nudge) =>
      ids.every((id, i) => {
        const s = spot(i, nudge);
        return [...positions].every(([other, p]) => Math.hypot(p.x - s.x, p.y - s.y) >= (foot(id) + foot(other)) / 2);
      });
    const nudges = [0];
    if (!linked) for (let distance = 0.5; distance <= MAX_STACK_NUDGE; distance += 0.5) nudges.push(distance, -distance);
    const nudge = nudges.find(isClear) ?? 0;
    ids.forEach((id, i) => positions.set(id, spot(i, nudge)));
  }
}

function segmentsCross(a, b, c, d) {
  const ccw = (p, q, r) => (r.y - p.y) * (q.x - p.x) > (q.y - p.y) * (r.x - p.x);
  return ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d);
}

/** Lower is tidier: crossings, plus lines passing behind nodes they don't belong to. */
export function layoutUntidiness(graph, positions) {
  const links = [];
  for (const l of graph.links) {
    const s = idOf(l.source);
    const t = idOf(l.target);
    if (positions.has(s) && positions.has(t)) links.push([s, t]);
  }
  let score = 0;
  for (let i = 0; i < links.length; i++) {
    const [s, t] = links[i];
    const a = positions.get(s);
    const b = positions.get(t);
    for (let j = i + 1; j < links.length; j++) {
      const [u, v] = links[j];
      if (s === u || s === v || t === u || t === v) continue;
      if (segmentsCross(a, b, positions.get(u), positions.get(v))) score += 1;
    }
    for (const [id, node] of graph.nodes) {
      if (id === s || id === t) continue;
      if (pointSegmentDistance(positions.get(id), a, b).dist < nodeRadius(node)) score += 2;
    }
  }
  return score;
}

/**
 * Pulls each branch towards its parent, deepest first, stopping before it would
 * come too close to anything else, or add a crossing or a line behind a node.
 */
function compact(graph, rootId, children, shared, adj, positions, foot, passes) {
  const parentOf = new Map();
  const deepestFirst = [];
  const visit = (id) => {
    for (const kid of children.get(id)) {
      parentOf.set(kid, id);
      visit(kid);
    }
    // A leaf is as close in as its fan allows already, unless a big sibling
    // set how far out the whole fan sits.
    const fan = id === rootId ? [] : children.get(parentOf.get(id));
    if (id !== rootId && (children.get(id).length > 0 || fan.some((kid) => children.get(kid).length > 0))) {
      deepestFirst.push(id);
    }
  };
  visit(rootId);

  // Nodes sharing words have to stay far enough apart for them to fit between.
  const between = new Map();
  for (const id of shared) {
    const anchors = [...adj.get(id)].filter((n) => positions.has(n));
    for (let i = 0; i < anchors.length; i++) {
      for (let j = i + 1; j < anchors.length; j++) {
        const pair = `${anchors[i]}|${anchors[j]}`;
        const entry = between.get(pair) ?? { a: anchors[i], b: anchors[j], count: 0, largest: 0 };
        entry.count += 1;
        entry.largest = Math.max(entry.largest, foot(id));
        between.set(pair, entry);
      }
    }
  }
  // Only as wide as a stack gets: a long one grows across the line, not along it.
  const keepApart = [...between.values()].map(({ a, b, count, largest }) => ({
    a,
    b,
    dist: (foot(a) + foot(b)) / 2 + largest * Math.min(count, MAX_STACK_ROOM) * SHARED_WORD_ROOM,
  }));

  const placed = [...positions.keys()];
  const links = [];
  for (const l of graph.links) {
    const s = idOf(l.source);
    const t = idOf(l.target);
    if (positions.has(s) && positions.has(t)) links.push([s, t]);
  }

  for (let pass = 0; pass < passes; pass++) {
    for (const id of deepestFirst) {
      const branch = subtreeOf(id, children);
      const outside = placed.filter((other) => !branch.has(other));
      const moved = links.filter(([s, t]) => branch.has(s) || branch.has(t));
      const still = links.filter(([s, t]) => !branch.has(s) && !branch.has(t));
      // Crossings and lines behind nodes that this branch has any part in.
      const trouble = () => {
        let count = 0;
        for (const [s, t] of moved) {
          const a = positions.get(s);
          const b = positions.get(t);
          for (const [u, v] of still) {
            if (s === u || s === v || t === u || t === v) continue;
            if (segmentsCross(a, b, positions.get(u), positions.get(v))) count += 1;
          }
          for (const other of outside) {
            if (other === s || other === t) continue;
            const clear = nodeRadius(graph.nodes.get(other)) + EXPAND_RING;
            if (pointSegmentDistance(positions.get(other), a, b).dist < clear) count += 1;
          }
        }
        for (const [s, t] of still) {
          for (const member of branch) {
            const clear = nodeRadius(graph.nodes.get(member)) + EXPAND_RING;
            if (pointSegmentDistance(positions.get(member), positions.get(s), positions.get(t)).dist < clear) count += 1;
          }
        }
        return count;
      };
      const crowded = () => {
        for (const member of branch) {
          const p = positions.get(member);
          for (const other of outside) {
            const q = positions.get(other);
            if (Math.hypot(p.x - q.x, p.y - q.y) < (foot(member) + foot(other)) / 2) return true;
          }
        }
        return keepApart.some(({ a, b, dist }) => {
          if (branch.has(a) === branch.has(b)) return false;
          const p = positions.get(a);
          const q = positions.get(b);
          return Math.hypot(p.x - q.x, p.y - q.y) < dist;
        });
      };
      const shift = (dx, dy) => {
        for (const member of branch) {
          const p = positions.get(member);
          p.x += dx;
          p.y += dy;
        }
      };

      const parent = positions.get(parentOf.get(id));
      const self = positions.get(id);
      const shortest = Math.max(MIN_LINK_LENGTH, (foot(id) + foot(parentOf.get(id))) / 2);
      const allowed = trouble();
      for (;;) {
        const dx = self.x - parent.x;
        const dy = self.y - parent.y;
        const length = Math.hypot(dx, dy);
        const next = Math.max(shortest, length * COMPACT_STEP);
        // Within a hair of its shortest, a step would move it by nothing.
        if (length - next < MIN_COMPACT_MOVE) break;
        const step = (next - length) / length;
        shift(dx * step, dy * step);
        if (crowded() || trouble() > allowed) {
          shift(-dx * step, -dy * step);
          break;
        }
      }
    }
  }
}

/** Sorts each node's children by where the things they're connected to already sit. */
function orderByConnections(children, adj, shared, positions) {
  // Sharing a word pulls two nodes together, as a direct link would.
  const reach = new Map([...adj.keys()].map((id) => [id, new Set(adj.get(id))]));
  for (const id of shared) {
    for (const a of adj.get(id)) {
      reach.get(a).delete(id);
      for (const b of adj.get(id)) if (a !== b) reach.get(a).add(b);
    }
  }
  for (const [id, kids] of children) {
    if (kids.length < 2) continue;
    const origin = positions.get(id);
    const wanted = new Map();
    for (const kid of kids) {
      const own = subtreeOf(kid, children);
      let x = 0;
      let y = 0;
      let count = 0;
      for (const member of own) {
        for (const other of reach.get(member)) {
          if (own.has(other) || other === id) continue;
          const p = positions.get(other);
          if (p) {
            x += p.x;
            y += p.y;
            count += 1;
          }
        }
      }
      const target = count ? { x: x / count, y: y / count } : positions.get(kid);
      wanted.set(kid, Math.atan2(target.y - origin.y, target.x - origin.x));
    }
    // Measured from the side of the fan opposite its middle, so a fan isn't
    // cut through the part it's using.
    const mean = Math.atan2(
      kids.reduce((sum, kid) => sum + Math.sin(wanted.get(kid)), 0),
      kids.reduce((sum, kid) => sum + Math.cos(wanted.get(kid)), 0)
    );
    const offset = (a) => ((a - mean + Math.PI * 3) % FULL_CIRCLE) - Math.PI;
    const rank = new Map(kids.map((kid, i) => [kid, i]));
    children.set(
      id,
      [...kids].sort((a, b) => offset(wanted.get(a)) - offset(wanted.get(b)) || rank.get(a) - rank.get(b))
    );
  }
}

// Two children sharing a word would otherwise end up on opposite sides of the
// root, with the root on the line between them, right where the word goes. So
// they go side by side.
function rootSpanFor(rootId, children, shared, adj) {
  const kids = children.get(rootId);
  if (kids.length !== 2) return FULL_CIRCLE;
  const bridged = [...shared].some((id) => adj.get(id).has(kids[0]) && adj.get(id).has(kids[1]));
  return bridged ? BRIDGED_ROOT_SPAN : FULL_CIRCLE;
}

function placeTree(rootId, children, shared, adj, foot) {
  const rootSpan = rootSpanFor(rootId, children, shared, adj);
  const sizes = new Map();
  measure(rootId, rootId, rootSpan, children, foot, sizes);
  const positions = new Map();
  place(rootId, 0, 0, -Math.PI / 2, rootId, rootSpan, children, sizes, positions);
  return positions;
}

/** Turns the fans of nodes sharing a word away from each other, leaving the gap between them for it. */
function turnFansApart(rootId, children, shared, adj, positions) {
  const parentOf = new Map();
  for (const [id, kids] of children) for (const kid of kids) parentOf.set(kid, id);
  // In a web, with partners all round, there's no "away" to turn to.
  const partnersOf = new Map([...positions.keys()].map((id) => [id, new Set()]));
  for (const word of shared) {
    const anchors = [...adj.get(word)].filter((n) => positions.has(n));
    for (const a of anchors) {
      for (const b of anchors) if (a !== b && b !== rootId && b !== parentOf.get(a)) partnersOf.get(a).add(b);
    }
  }
  const turned = new Set();
  for (const word of shared) {
    const anchors = [...adj.get(word)].filter((n) => positions.has(n));
    for (const hub of anchors) {
      if (turned.has(hub) || hub === rootId || children.get(hub).length === 0) continue;
      const partners = partnersOf.get(hub);
      if (partners.size !== 1) continue;
      const [partner] = partners;
      turned.add(hub);
      const h = positions.get(hub);
      const from = positions.get(parentOf.get(hub));
      const other = positions.get(partner);
      const unit = (a, b) => {
        const length = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        return { x: (a.x - b.x) / length, y: (a.y - b.y) / length };
      };
      const outward = unit(h, from);
      const away = unit(h, other);
      const turn = Math.atan2(outward.y + away.y, outward.x + away.x) - Math.atan2(outward.y, outward.x);
      const cos = Math.cos(turn);
      const sin = Math.sin(turn);
      for (const member of subtreeOf(hub, children)) {
        if (member === hub) continue;
        const p = positions.get(member);
        const dx = p.x - h.x;
        const dy = p.y - h.y;
        p.x = h.x + dx * cos - dy * sin;
        p.y = h.y + dx * sin + dy * cos;
      }
    }
  }
}

function buildPositions(rootId, children, shared, adj, foot) {
  const positions = placeTree(rootId, children, shared, adj, foot);
  turnFansApart(rootId, children, shared, adj, positions);
  placeSharedWords(shared, adj, positions, foot);
  return positions;
}

/** Tries swapping siblings, keeping any swap that leaves the graph tidier. */
function improveBySwaps(graph, rootId, children, shared, adj, foot, maxTries) {
  const score = () => layoutUntidiness(graph, buildPositions(rootId, children, shared, adj, foot));
  let best = score();
  let tries = 0;
  for (const id of [...children.keys()]) {
    const count = children.get(id).length;
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        if (best === 0 || tries >= maxTries) return;
        const kids = children.get(id);
        // Childless siblings with no other links are interchangeable.
        const matters = (kid) => children.get(kid).length > 0 || adj.get(kid).size > 1;
        if (!matters(kids[i]) && !matters(kids[j])) continue;
        const swapped = [...kids];
        [swapped[i], swapped[j]] = [swapped[j], swapped[i]];
        children.set(id, swapped);
        tries += 1;
        const candidate = score();
        if (candidate < best) best = candidate;
        else children.set(id, kids);
      }
    }
  }
}

function boundsOf(positions) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of positions.values()) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x0, y0, w: x1 - x0, h: y1 - y0 };
}

function squeezeToViewport(positions, graph, width, height) {
  if (graph.nodes.size < ASPECT_MIN_NODES) return;
  const { w, h } = boundsOf(positions);
  if (w === 0 || h === 0) return;
  const wanted = width / height;
  const shape = w / h;
  if (shape > wanted) {
    const sx = Math.max(MIN_ASPECT_SQUEEZE, wanted / shape);
    for (const p of positions.values()) p.x *= sx;
  } else {
    const sy = Math.max(MIN_ASPECT_SQUEEZE, shape / wanted);
    for (const p of positions.values()) p.y *= sy;
  }
}

/** Separates nodes that are too close and moves them off lines that aren't theirs. The root stays put. */
function relax(graph, rootId, positions, foot, passes) {
  const ids = [...graph.nodes.keys()];
  const links = [];
  for (const l of graph.links) {
    const s = idOf(l.source);
    const t = idOf(l.target);
    if (positions.has(s) && positions.has(t)) links.push([s, t]);
  }
  for (let pass = 0; pass < passes; pass++) {
    let moved = false;
    for (const [s, t] of links) {
      const a = positions.get(s);
      const b = positions.get(t);
      for (const id of ids) {
        if (id === s || id === t) continue;
        const p = positions.get(id);
        const needed = nodeRadius(graph.nodes.get(id)) + EXPAND_RING + LINE_CLEARANCE;
        const { dist, cx, cy } = pointSegmentDistance(p, a, b);
        if (dist >= needed) continue;
        const away = dist > 0.01 ? { x: p.x - cx, y: p.y - cy } : { x: a.y - b.y, y: b.x - a.x };
        const norm = Math.hypot(away.x, away.y) || 1;
        const dx = (away.x / norm) * (needed - dist);
        const dy = (away.y / norm) * (needed - dist);
        if (id === rootId) {
          // The root stays put, so the line moves off it instead.
          a.x -= dx;
          a.y -= dy;
          b.x -= dx;
          b.y -= dy;
        } else {
          p.x += dx;
          p.y += dy;
        }
        moved = true;
      }
    }
    for (let i = 0; i < ids.length; i++) {
      const a = positions.get(ids[i]);
      for (let j = i + 1; j < ids.length; j++) {
        const b = positions.get(ids[j]);
        const needed = (foot(ids[i]) + foot(ids[j])) / 2;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.hypot(dx, dy);
        if (dist >= needed) continue;
        if (dist < 0.01) {
          // Stacked exactly: part them along a direction fixed by their order.
          dx = Math.cos(i + j);
          dy = Math.sin(i + j);
          dist = 1;
        }
        const push = (needed - dist) / 2 / dist;
        moved = true;
        if (ids[i] !== rootId) {
          a.x -= dx * push;
          a.y -= dy * push;
        }
        if (ids[j] !== rootId) {
          b.x += dx * push;
          b.y += dy * push;
        }
      }
    }
    if (!moved) break;
  }
}

/**
 * Spacing and lines can pull a node in opposite directions forever. Whatever's
 * still behind a line after relax gets moved straight to the nearest spot clear
 * of every node and line, if there is one.
 */
function moveOffLines(graph, rootId, positions, foot) {
  const ids = [...graph.nodes.keys()];
  const links = [];
  for (const l of graph.links) {
    const s = idOf(l.source);
    const t = idOf(l.target);
    if (positions.has(s) && positions.has(t)) links.push([s, t]);
  }
  const clearOf = (id) => nodeRadius(graph.nodes.get(id)) + EXPAND_RING;
  const blockingLine = (id, p) =>
    links.find(([s, t]) => {
      if (s === id || t === id) return false;
      return pointSegmentDistance(p, positions.get(s), positions.get(t)).dist < clearOf(id);
    });
  const isFree = (id, p) =>
    !blockingLine(id, p) &&
    ids.every((other) => {
      if (other === id) return true;
      const q = positions.get(other);
      return Math.hypot(p.x - q.x, p.y - q.y) >= (foot(id) + foot(other)) / 2;
    });
  for (const id of ids) {
    if (id === rootId) continue;
    const p = positions.get(id);
    const line = blockingLine(id, p);
    if (!line) continue;
    const a = positions.get(line[0]);
    const b = positions.get(line[1]);
    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = -(b.y - a.y) / length;
    const ny = (b.x - a.x) / length;
    search: for (let step = 1; step <= OFF_LINE_TRIES; step++) {
      for (const side of [1, -1]) {
        const spot = { x: p.x + side * nx * step * OFF_LINE_STEP, y: p.y + side * ny * step * OFF_LINE_STEP };
        if (isFree(id, spot)) {
          positions.set(id, spot);
          break search;
        }
      }
    }
  }
}

function arrange(graph, labelScale, width, height) {
  const feet = new Map();
  for (const [id, node] of graph.nodes) feet.set(id, footprint(node, labelScale));
  const foot = (id) => feet.get(id);
  const adj = adjacencyOf(graph);
  const { rootId, children } = spanningTree(graph, adj);
  const shared = liftSharedWords(rootId, children, adj);
  const effort = effortFor(graph.nodes.size);

  for (let pass = 0; pass < ORDER_PASSES; pass++) {
    orderByConnections(children, adj, shared, buildPositions(rootId, children, shared, adj, foot));
  }
  if (effort.swaps > 0) improveBySwaps(graph, rootId, children, shared, adj, foot, effort.swaps);

  const positions = placeTree(rootId, children, shared, adj, foot);
  turnFansApart(rootId, children, shared, adj, positions);
  compact(graph, rootId, children, shared, adj, positions, foot, effort.compact);
  placeSharedWords(shared, adj, positions, foot);
  squeezeToViewport(positions, graph, width, height);
  relax(graph, rootId, positions, foot, effort.relax);
  moveOffLines(graph, rootId, positions, foot);
  return positions;
}

/**
 * Where every node goes: id -> { x, y }, centered where the simulation centers
 * the graph. `graph` is { nodes: Map, links }; `width`/`height` the viewport.
 */
export function organizeLayout(graph, { width = 800, height = 600 } = {}) {
  if (graph.nodes.size === 0) return new Map();
  // A big graph will be zoomed out, where its labels take up more room
  // relative to their bubbles, so it's arranged allowing for that.
  let positions;
  if (graph.nodes.size > ALWAYS_ZOOMED_NODES) {
    positions = arrange(graph, 1 / MIN_PLANNED_ZOOM, width, height);
  } else {
    positions = arrange(graph, 1, width, height);
    const { w, h } = boundsOf(positions);
    const zoom = Math.min(1, (width - VIEW_PAD) / (w + VIEW_PAD), (height - VIEW_PAD) / (h + VIEW_PAD));
    if (zoom < 1) positions = arrange(graph, 1 / Math.max(MIN_PLANNED_ZOOM, zoom), width, height);
  }

  const box = boundsOf(positions);
  const dx = width / 2 - (box.x0 + box.w / 2);
  const dy = height * CENTER_Y_BIAS - (box.y0 + box.h / 2);
  for (const p of positions.values()) {
    p.x += dx;
    p.y += dy;
  }
  return positions;
}
