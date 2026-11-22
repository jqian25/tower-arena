import Block from '../terrain/mesh/block'
import { BlockType } from '../terrain'
import Noise from '../terrain/noise'
import { caveSites, orePlan, springSite } from '../../caves.js'
import { coverBlock } from './biome'
import { terrainHeight } from '../../height.js'

function groundY(noise: Noise, x: number, z: number) {
  return terrainHeight(x, z, noise.get(x / noise.gap, z / noise.gap, noise.seed))
}

export function buildScenes(noise: Noise) {
  const blocks: Block[] = []
  const seen = new Set<string>()
  const put = (x: number, y: number, z: number, type: BlockType) => {
    const key = `${x}_${y}_${z}`
    if (seen.has(key) || y < 1 || y > 80) return
    seen.add(key)
    blocks.push(new Block(x, y, z, type, true))
  }
  for (const site of caveSites) buildCave(put, blocks, noise, site.x, site.z)
  buildSpring(put, noise, springSite.x, springSite.z)
  return blocks
}

export function stampScenes(terrain: { noise: Noise; customBlocks: Block[] }) {
  const scenes = buildScenes(terrain.noise)
  const occupied = new Set(scenes.map(block => `${block.x}_${block.y}_${block.z}`))
  const user = terrain.customBlocks.filter(block => !occupied.has(`${block.x}_${block.y}_${block.z}`))
  terrain.customBlocks = [...scenes, ...user]
}

function digSurface(blocks: Block[], noise: Noise, x: number, z: number) {
  const y = groundY(noise, x, z)
  const yOffset = y - 30
  const stoneOffset = noise.get(x / noise.stoneGap, z / noise.stoneGap, noise.stoneSeed) * noise.stoneAmp
  const coalOffset = noise.get(x / noise.coalGap, z / noise.coalGap, noise.coalSeed) * noise.coalAmp
  const type = coverBlock(
    x,
    z,
    yOffset,
    stoneOffset,
    coalOffset,
    noise.stoneThreshold,
    noise.coalThreshold
  ) as BlockType
  blocks.push(new Block(x, y, z, type, false))
}

function buildCave(
  put: (x: number, y: number, z: number, type: BlockType) => void,
  blocks: Block[],
  noise: Noise,
  cx: number,
  cz: number
) {
  const g = groundY(noise, cx, cz)
  const floor = g - 5
  const oreAt = (dx: number, dy: number, dz: number) =>
    orePlan.find(ore => ore.dx === dx && ore.dy === dy && ore.dz === dz)
  for (let x = cx - 3; x <= cx + 3; x++) {
    for (let z = cz - 5; z <= cz; z++) {
      const dx = x - cx
      const dz = z - cz
      put(x, floor, z, BlockType.stone)
      const edge = Math.abs(dx) === 3 || dz === -5 || dz === 0
      const door = dz === 0 && dx === 0
      if (!edge || door) continue
      for (let h = 1; h <= 3; h++) {
        const ore = oreAt(dx, h, dz)
        const type = ore?.kind === 'diamond' ? BlockType.diamond : ore?.kind === 'gold' ? BlockType.gold : BlockType.stone
        put(x, floor + h, z, type)
      }
    }
  }
  for (let x = cx - 2; x <= cx + 2; x++) {
    for (let z = cz - 4; z <= cz - 1; z++) put(x, floor + 4, z, BlockType.stone)
  }
  for (let step = 0; step <= 5; step++) {
    const y = floor + step
    const z = cz + 1 + step
    for (const x of [cx - 1, cx, cx + 1]) {
      const surface = groundY(noise, x, z)
      if (y < surface) digSurface(blocks, noise, x, z)
      put(x, y, z, BlockType.stone)
      if (x !== cx) put(x, y + 1, z, BlockType.stone)
    }
  }
  const mouth = groundY(noise, cx, cz + 6)
  put(cx - 2, mouth + 1, cz + 6, BlockType.stone)
  put(cx - 2, mouth + 2, cz + 6, BlockType.stone)
  put(cx + 2, mouth + 1, cz + 6, BlockType.stone)
  put(cx + 2, mouth + 2, cz + 6, BlockType.stone)
  put(cx - 1, mouth + 3, cz + 6, BlockType.wood)
  put(cx, mouth + 3, cz + 6, BlockType.wood)
  put(cx + 1, mouth + 3, cz + 6, BlockType.wood)
}

function buildSpring(
  put: (x: number, y: number, z: number, type: BlockType) => void,
  noise: Noise,
  cx: number,
  cz: number
) {
  const g = groundY(noise, cx, cz)
  for (let x = -2; x <= 2; x++) {
    for (let z = -2; z <= 2; z++) {
      const rim = Math.abs(x) === 2 || Math.abs(z) === 2
      put(cx + x, g + 1, cz + z, rim ? BlockType.quartz : BlockType.glass)
    }
  }
}
