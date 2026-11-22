import * as THREE from 'three'
import Block from '../mesh/block'
import Noise from '../noise'
import { coverBlock, naturalTree } from '../../world/biome'
import { terrainHeight } from '../../../height.js'

enum BlockType {
  grass = 0,
  sand = 1,
  tree = 2,
  leaf = 3,
  dirt = 4,
  stone = 5,
  coal = 6,
  wood = 7,
  diamond = 8,
  quartz = 9,
  glass = 10,
  bedrock = 11,
  gold = 12
}

const matrix = new THREE.Matrix4()
const noise = new Noise()
const blocks: THREE.InstancedMesh[] = []

const geometry = new THREE.BoxGeometry()

let isFirstRun = true

onmessage = (
  msg: MessageEvent<{
    distance: number
    chunk: THREE.Vector2
    noiseSeed: number
    treeSeed: number
    stoneSeed: number
    coalSeed: number
    idMap: Map<string, number>
    blocksFactor: number[]
    blocksCount: number[]
    customBlocks: Block[]
    chunkSize: number
  }>
) => {
  // let p1 = performance.now()
  const {
    distance,
    chunk,
    noiseSeed,
    idMap,
    blocksFactor,
    treeSeed,
    stoneSeed,
    coalSeed,
    customBlocks,
    blocksCount,
    chunkSize
  } = msg.data

  const span = chunkSize * (distance * 2 + 1)
  const maxCount = span * span + 4000

  if (isFirstRun) {
    for (let i = 0; i < blocksCount.length; i++) {
      let block = new THREE.InstancedMesh(
        geometry,
        new THREE.MeshBasicMaterial(),
        maxCount * blocksFactor[i]
      )
      blocks.push(block)
    }

    isFirstRun = false
  }

  noise.seed = noiseSeed
  noise.treeSeed = treeSeed
  noise.stoneSeed = stoneSeed
  noise.coalSeed = coalSeed

  for (let i = 0; i < blocks.length; i++) {
    blocks[i].instanceMatrix = new THREE.InstancedBufferAttribute(
      new Float32Array(maxCount * blocksFactor[i] * 16),
      16
    )
  }

  const paint = (type: number, x: number, y: number, z: number, record = true) => {
    const mesh = blocks[type]
    if (!mesh || blocksCount[type] >= mesh.instanceMatrix.count) return
    if (record) idMap.set(`${x}_${y}_${z}`, blocksCount[type])
    matrix.setPosition(x, y, z)
    mesh.setMatrixAt(blocksCount[type]++, matrix)
  }

  for (
    let x = -chunkSize * distance + chunkSize * chunk.x;
    x < chunkSize * distance + chunkSize + chunkSize * chunk.x;
    x++
  ) {
    for (
      let z = -chunkSize * distance + chunkSize * chunk.y;
      z < chunkSize * distance + chunkSize + chunkSize * chunk.y;
      z++
    ) {
      const ground = terrainHeight(x, z, noise.get(x / noise.gap, z / noise.gap, noise.seed))
      const yOffset = ground - 30

      const stoneOffset =
        noise.get(x / noise.stoneGap, z / noise.stoneGap, noise.stoneSeed) *
        noise.stoneAmp

      const coalOffset =
        noise.get(x / noise.coalGap, z / noise.coalGap, noise.coalSeed) *
        noise.coalAmp

      paint(
        coverBlock(
          x,
          z,
          yOffset,
          stoneOffset,
          coalOffset,
          noise.stoneThreshold,
          noise.coalThreshold
        ),
        x,
        ground,
        z
      )

      // tree
      const treeOffset =
        noise.get(x / noise.treeGap, z / noise.treeGap, noise.treeSeed) *
        noise.treeAmp

      if (
        naturalTree(
          x,
          z,
          treeOffset,
          noise.treeThreshold,
          yOffset,
          stoneOffset,
          noise.stoneThreshold
        )
      ) {
        for (let i = 1; i <= noise.treeHeight; i++) {
          paint(BlockType.tree, x, ground + i, z)
        }

        // leaf
        for (let i = -3; i < 3; i++) {
          for (let j = -3; j < 3; j++) {
            for (let k = -3; k < 3; k++) {
              if (i === 0 && k === 0) {
                continue
              }
              const leafOffset =
                noise.get(
                  (x + i + j) / noise.leafGap,
                  (z + k) / noise.leafGap,
                  noise.leafSeed
                ) * noise.leafAmp
              if (leafOffset > noise.leafThreshold) {
                paint(BlockType.leaf, x + i, ground + noise.treeHeight + j, z + k)
              }
            }
          }
        }
      }
    }
  }

  for (const block of customBlocks) {
    if (
      block.x > -chunkSize * distance + chunkSize * chunk.x &&
      block.x < chunkSize * distance + chunkSize + chunkSize * chunk.x &&
      block.z > -chunkSize * distance + chunkSize * chunk.y &&
      block.z < chunkSize * distance + chunkSize + chunkSize * chunk.y
    ) {
      if (block.placed) {
        paint(block.type, block.x, block.y, block.z, false)
      } else {
        // removed blocks
        const id = idMap.get(`${block.x}_${block.y}_${block.z}`)
        if (id === undefined || !blocks[block.type]) continue

        blocks[block.type].setMatrixAt(
          id,
          new THREE.Matrix4().set(
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          )
        )
      }
    }
  }

  const arrays = blocks.map(block => block.instanceMatrix.array)
  postMessage({ idMap, arrays, blocksCount })
  // console.log(performance.now() - p1)
}
