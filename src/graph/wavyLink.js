// The shape of a meaning link: a wave running along the straight line between
// two points. Each half-wave is one quadratic curve, whose peak sits halfway
// to its control point, hence the doubled amplitude below.
const AMPLITUDE = 2;
const HALF_WAVELENGTH = 16;

/**
 * SVG path data from (x1, y1) to (x2, y2). The wavelength is fixed and the wave
 * is measured from the start point, so a link that stretches as the graph
 * settles just gains or loses waves at its far end instead of rippling along
 * its whole length. Whatever is left over is a short straight run into the end
 * point, which is under the target node on the graph.
 */
export function wavyLinkPath(x1, y1, x2, y2, { amplitude = AMPLITUDE, halfWavelength = HALF_WAVELENGTH } = {}) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  const halfWaves = Math.floor(length / halfWavelength);
  if (halfWaves < 1) return `M${x1},${y1} L${x2},${y2}`;

  const ux = dx / length;
  const uy = dy / length;
  const along = (d) => [x1 + ux * d, y1 + uy * d];
  const [cx, cy] = along(halfWavelength / 2);
  const [ex, ey] = along(halfWavelength);
  // T mirrors the previous control point, which is what makes it alternate.
  let d = `M${x1},${y1} Q${cx - uy * amplitude * 2},${cy + ux * amplitude * 2} ${ex},${ey}`;
  for (let i = 2; i <= halfWaves; i++) {
    const [px, py] = along(i * halfWavelength);
    d += ` T${px},${py}`;
  }
  return `${d} L${x2},${y2}`;
}
