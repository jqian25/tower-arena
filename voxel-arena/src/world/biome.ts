export type Biome = 'plains' | 'desert' | 'coast' | 'stone' | 'forest' | 'snow'

export const BlockKind = {
  grass: 0,
  sand: 1,
  tree: 2,
  leaf: 3,
  dirt: 4,
  stone: 5,
  coal: 6,
  wood: 7,
  diamond: 8,
  quartz: 9,
  glass: 10,
  bedrock: 11
} as const

export function biomeAt(x: number, z: number): Biome {
  if (x > 110 && z < -110) return 'snow'
  if (x > 80 && z > -70 && z < 90) return 'desert'
  if (z > 100) return 'coast'
  if (z < -100) return 'stone'
  if (x < -100) return 'forest'
  return 'plains'
}

export function coverBlock(
  x: number,
  z: number,
  yOffset: number,
  stoneOffset: number,
  coalOffset: number,
  stoneThreshold: number,
  coalThreshold: number
) {
  const biome = biomeAt(x, z)
  switch (biome) {
    case 'snow':
      return BlockKind.quartz
    case 'desert':
    case 'coast':
      return stoneOffset > stoneThreshold + 2.2 ? BlockKind.stone : BlockKind.sand
    case 'stone':
      return stoneOffset > stoneThreshold && coalOffset > coalThreshold ? BlockKind.coal : BlockKind.stone
    case 'forest':
    case 'plains':
      if (stoneOffset > stoneThreshold) {
        return coalOffset > coalThreshold ? BlockKind.coal : BlockKind.stone
      }
      if (yOffset < -3) return BlockKind.sand
      return BlockKind.grass
    default: {
      const neverBiome: never = biome
      return neverBiome
    }
  }
}

export function naturalTree(
  x: number,
  z: number,
  treeOffset: number,
  treeThreshold: number,
  yOffset: number,
  stoneOffset: number,
  stoneThreshold: number
) {
  const biome = biomeAt(x, z)
  switch (biome) {
    case 'plains':
    case 'forest':
      return treeOffset > treeThreshold && yOffset >= -3 && stoneOffset < stoneThreshold
    case 'desert':
    case 'coast':
    case 'stone':
    case 'snow':
      return false
    default: {
      const neverBiome: never = biome
      return neverBiome
    }
  }
}
