import { nodeRadius } from "./layout";

/**
 * The pan/zoom that frames every node inside a width x height viewport,
 * leaving `pad.left/right/top/bottom` clear (for the controls overlaid on
 * the graph). Never zooms in past 1:1 -- a two-node graph shouldn't
 * balloon to fill a phone -- and never out past `minK`, the zoom
 * behavior's own floor. Returns null when there's nothing to frame.
 */
export function fitTransform(nodes, width, height, { pad = {}, minK = 0.3 } = {}) {
  const { left = 24, right = 24, top = 24, bottom = 24 } = pad;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of nodes) {
    if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) continue;
    const r = nodeRadius(n);
    x0 = Math.min(x0, n.x - r);
    y0 = Math.min(y0, n.y - r);
    x1 = Math.max(x1, n.x + r);
    y1 = Math.max(y1, n.y + r);
  }
  if (x0 === Infinity) return null;
  const availW = Math.max(1, width - left - right);
  const availH = Math.max(1, height - top - bottom);
  const k = Math.max(minK, Math.min(1, availW / (x1 - x0), availH / (y1 - y0)));
  return {
    k,
    x: left + availW / 2 - k * ((x0 + x1) / 2),
    y: top + availH / 2 - k * ((y0 + y1) / 2),
  };
}

/**
 * How far in from each edge the graph must stay to clear the overlaid
 * controls, from their on-screen boxes. Each overlay is cleared along
 * whichever axis costs the smaller share of the graph: a tall, narrow
 * column of zoom buttons against its side edge, a wide toolbar against
 * the top. Overlays that don't overlap the graph are ignored.
 */
export function overlayInsets(graphRect, overlayRects, gap = 8) {
  const g = graphRect;
  const inset = { left: 0, right: 0, top: 0, bottom: 0 };
  for (const r of overlayRects) {
    if (!r.width || !r.height) continue;
    if (r.bottom <= g.top || r.top >= g.bottom || r.right <= g.left || r.left >= g.right) continue;
    const nearBottom = (r.top + r.bottom) / 2 > g.top + g.height / 2;
    const nearRight = (r.left + r.right) / 2 > g.left + g.width / 2;
    const vCost = nearBottom ? g.bottom - r.top + gap : r.bottom - g.top + gap;
    const hCost = nearRight ? g.right - r.left + gap : r.right - g.left + gap;
    if (hCost / g.width < vCost / g.height) {
      const side = nearRight ? "right" : "left";
      inset[side] = Math.max(inset[side], hCost);
    } else {
      const side = nearBottom ? "bottom" : "top";
      inset[side] = Math.max(inset[side], vCost);
    }
  }
  return inset;
}
