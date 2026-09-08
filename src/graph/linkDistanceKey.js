// A link's two endpoints can appear as (source, target) or (target, source)
// depending on where it came from -- this gives both a stable, order-independent
// key so a distance recorded from a drag (see WordTreeGraph) is found again by
// the simulation's distance accessor (see useForceSimulation) regardless of
// which side is which.
export function linkDistanceKey(a, b) {
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}
