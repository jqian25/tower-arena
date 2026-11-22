export const caveSites: Array<{ id: string; x: number; z: number }>
export const springSite: { x: number; z: number }
export const orePlan: Array<{ dx: number; dz: number; dy: number; kind: 'gold' | 'diamond' }>
export function oresAt(
  site: { x: number; z: number },
  ground: number
): Array<{ x: number; y: number; z: number; kind: 'gold' | 'diamond' }>
