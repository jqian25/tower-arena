import * as THREE from 'three'

export enum MaterialType {
  grass = 'grass',
  dirt = 'dirt',
  tree = 'tree',
  leaf = 'leaf',
  sand = 'sand',
  stone = 'stone',
  coal = 'coal',
  wood = 'wood',
  diamond = 'diamond',
  quartz = 'quartz',
  glass = 'glass',
  bedrock = 'bedrock',
  gold = 'gold'
}

function pixelTexture(paint: (g: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas')
  canvas.width = 16
  canvas.height = 16
  const ctx = canvas.getContext('2d')!
  paint(ctx)
  const texture = new THREE.CanvasTexture(canvas)
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.needsUpdate = true
  return texture
}

function speck(g: CanvasRenderingContext2D, color: string, n: number) {
  g.fillStyle = color
  for (let i = 0; i < n; i++) g.fillRect((i * 5) % 16, (i * 7) % 16, 1, 1)
}

const grassTop = pixelTexture(g => {
  g.fillStyle = '#1e5a2a'
  g.fillRect(0, 0, 16, 16)
  speck(g, '#12381a', 18)
  speck(g, '#2a6e34', 8)
})
const grassSide = pixelTexture(g => {
  g.fillStyle = '#4a301c'
  g.fillRect(0, 0, 16, 16)
  g.fillStyle = '#1e5a2a'
  g.fillRect(0, 0, 16, 5)
  speck(g, '#2e1c10', 10)
})
const dirtTex = pixelTexture(g => {
  g.fillStyle = '#3e2918'
  g.fillRect(0, 0, 16, 16)
  speck(g, '#24160e', 16)
})
const stoneTex = pixelTexture(g => {
  g.fillStyle = '#4e5258'
  g.fillRect(0, 0, 16, 16)
  speck(g, '#2a2d31', 14)
  speck(g, '#121416', 8)
})
const coalTex = pixelTexture(g => {
  g.fillStyle = '#16181b'
  g.fillRect(0, 0, 16, 16)
  speck(g, '#07080a', 12)
})
const log = pixelTexture(g => {
  g.fillStyle = '#3a2416'
  g.fillRect(0, 0, 16, 16)
  g.fillStyle = '#24150d'
  for (let x = 2; x < 16; x += 4) g.fillRect(x, 0, 1, 16)
})
const logTop = pixelTexture(g => {
  g.fillStyle = '#5a3a22'
  g.fillRect(0, 0, 16, 16)
  g.strokeStyle = '#2e1c10'
  g.strokeRect(3, 3, 10, 10)
  g.strokeRect(6, 6, 4, 4)
})
const leafTex = pixelTexture(g => {
  g.fillStyle = '#163f22'
  g.fillRect(0, 0, 16, 16)
  speck(g, '#0d2816', 12)
  g.clearRect(1, 2, 1, 1)
  g.clearRect(8, 11, 1, 1)
})
const sandTex = pixelTexture(g => {
  g.fillStyle = '#6e2824'
  g.fillRect(0, 0, 16, 16)
  speck(g, '#4a1614', 12)
})
const woodTex = pixelTexture(g => {
  g.fillStyle = '#5c221c'
  g.fillRect(0, 0, 16, 16)
  g.fillStyle = '#3a1210'
  for (let y = 0; y < 16; y += 4) g.fillRect(0, y, 16, 1)
})
const crystal = pixelTexture(g => {
  g.fillStyle = '#1a5c68'
  g.fillRect(0, 0, 16, 16)
  speck(g, '#0e3038', 10)
  speck(g, '#2a7a88', 5)
})
const quartzTex = pixelTexture(g => {
  g.fillStyle = '#6a6e74'
  g.fillRect(0, 0, 16, 16)
  speck(g, '#3e4248', 10)
})
const glassTex = pixelTexture(g => {
  g.fillStyle = 'rgba(28, 48, 56, 0.55)'
  g.fillRect(0, 0, 16, 16)
  g.strokeStyle = 'rgba(180, 200, 206, 0.55)'
  g.strokeRect(0.5, 0.5, 15, 15)
})
const goldTex = pixelTexture(g => {
  g.fillStyle = '#3a3c40'
  g.fillRect(0, 0, 16, 16)
  g.fillStyle = '#8a5a18'
  g.fillRect(3, 3, 4, 3)
  g.fillRect(9, 8, 5, 4)
  g.fillRect(5, 11, 3, 2)
})
const bedrockTex = pixelTexture(g => {
  g.fillStyle = '#0e1012'
  g.fillRect(0, 0, 16, 16)
  speck(g, '#050607', 14)
})

const mat = (map: THREE.Texture, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ map, roughness: 0.92, metalness: 0.02, ...extra })

export default class Materials {
  materials = {
    grass: [
      mat(grassSide),
      mat(grassSide),
      mat(grassTop),
      mat(dirtTex),
      mat(grassSide),
      mat(grassSide)
    ],
    dirt: mat(dirtTex),
    sand: mat(sandTex),
    tree: [mat(log), mat(log), mat(logTop), mat(logTop), mat(log), mat(log)],
    leaf: mat(leafTex, { transparent: true, alphaTest: 0.4, color: new THREE.Color('#2a5a32') }),
    stone: mat(stoneTex),
    coal: mat(coalTex),
    wood: mat(woodTex),
    diamond: mat(crystal, { emissive: new THREE.Color('#0c3038'), emissiveIntensity: 0.12 }),
    quartz: mat(quartzTex),
    glass: mat(glassTex, { transparent: true, opacity: 0.45 }),
    bedrock: mat(bedrockTex),
    gold: mat(goldTex, { emissive: new THREE.Color('#6a4a10'), emissiveIntensity: 0.18, metalness: 0.35 })
  }

  get = (type: MaterialType): THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[] => {
    return this.materials[type]
  }
}
