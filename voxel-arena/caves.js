export const caveSites = [
  { id: 'meadow', x: 26, z: -32 },
  { id: 'ridge', x: 12, z: -160 }
]

export const springSite = { x: -58, z: 78 }

export const orePlan = [
  { dx: 0, dz: -5, dy: 2, kind: 'gold' },
  { dx: 2, dz: -5, dy: 1, kind: 'gold' },
  { dx: -2, dz: -5, dy: 2, kind: 'diamond' },
  { dx: 3, dz: -2, dy: 1, kind: 'gold' },
  { dx: -3, dz: -3, dy: 2, kind: 'diamond' },
  { dx: 3, dz: -4, dy: 3, kind: 'gold' }
]

export function oresAt(site, ground) {
  const floor = ground - 5
  return orePlan.map(ore => ({
    x: site.x + ore.dx,
    y: floor + ore.dy,
    z: site.z + ore.dz,
    kind: ore.kind
  }))
}
