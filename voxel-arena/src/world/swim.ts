import * as THREE from 'three'
import Control from '../control'
import { arena } from '../arena/net'

const SEA = 25.5
const SPECIES = ['', '米诺', '绿鳍', '金鱼', '赤鲤', '河豚']
const TILES = ['', '074', '073', '081', '078', '101']
const REEF = ['010', '014', '028', '032', '048', '050', '082', '084']
const DIVE_LO = 17.55
const DIVE_HI = 21.2

export function createSwim(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  control: Control,
  ground: (x: number, z: number) => number,
  note: (text: string) => void,
  blocked: () => boolean,
  onLevel: (level: number) => void
) {
  const hud = document.querySelector<HTMLElement>('#fish-hud')
  const ashoreButton = document.querySelector<HTMLButtonElement>('#ashore')
  const loader = new THREE.TextureLoader()
  const textures = new Map<string, THREE.Texture>()
  const tex = (tile: string) => {
    const cached = textures.get(tile)
    if (cached) return cached
    const map = loader.load(`fish/fishTile_${tile}.png`)
    map.encoding = THREE.sRGBEncoding
    textures.set(tile, map)
    return map
  }
  const maps = TILES.map(tile => (tile ? tex(tile) : null))
  const selfMat = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, alphaTest: 0.35 })
  const selfFish = new THREE.Sprite(selfMat)
  selfFish.visible = false
  selfFish.renderOrder = 3
  scene.add(selfFish)

  const reef = new THREE.Group()
  reef.visible = false
  scene.add(reef)
  const props: { sprite: THREE.Sprite; x: number; z: number; y: number }[] = []
  for (let i = 0; i < 64; i++) {
    const tile = REEF[i % REEF.length]
    const plant = Number(tile) < 80
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex(tile),
      transparent: true,
      depthWrite: false,
      alphaTest: 0.25
    }))
    sprite.scale.set(plant ? 2.2 : 2.6, plant ? 3.3 : 1.7, 1)
    sprite.visible = false
    reef.add(sprite)
    props.push({ sprite, x: 0, z: 0, y: plant ? 17.9 : 17.1 })
  }

  const sandCanvas = document.createElement('canvas')
  sandCanvas.width = 256
  sandCanvas.height = 256
  const sandCtx = sandCanvas.getContext('2d')
  if (sandCtx) {
    sandCtx.fillStyle = '#6e8b72'
    sandCtx.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 520; i++) {
      sandCtx.fillStyle = i % 3 === 0 ? 'rgba(196, 176, 122, 0.45)' : 'rgba(36, 78, 74, 0.35)'
      sandCtx.fillRect((i * 47) % 256, (i * 91) % 256, 2 + (i % 3), 2)
    }
  }
  const sandMap = new THREE.CanvasTexture(sandCanvas)
  sandMap.encoding = THREE.sRGBEncoding
  sandMap.wrapS = THREE.RepeatWrapping
  sandMap.wrapT = THREE.RepeatWrapping
  sandMap.repeat.set(8, 8)
  const rig = new THREE.Group()
  rig.visible = false
  const sand = new THREE.Mesh(
    new THREE.CircleGeometry(90, 40),
    new THREE.MeshBasicMaterial({ map: sandMap, color: 0xc4d2b0 })
  )
  sand.rotation.x = -Math.PI / 2
  sand.position.y = 16.15
  const causticCanvas = document.createElement('canvas')
  causticCanvas.width = 256
  causticCanvas.height = 256
  const causticCtx = causticCanvas.getContext('2d')
  if (causticCtx) {
    causticCtx.clearRect(0, 0, 256, 256)
    causticCtx.strokeStyle = 'rgba(236, 255, 255, 0.85)'
    causticCtx.lineWidth = 3
    for (let row = 0; row < 9; row++) {
      causticCtx.beginPath()
      for (let x = 0; x <= 256; x += 8) {
        const y = 16 + row * 28 + Math.sin(x * 0.08 + row) * 8
        if (x === 0) causticCtx.moveTo(x, y)
        else causticCtx.lineTo(x, y)
      }
      causticCtx.stroke()
    }
  }
  const causticMap = new THREE.CanvasTexture(causticCanvas)
  causticMap.wrapS = THREE.RepeatWrapping
  causticMap.wrapT = THREE.RepeatWrapping
  causticMap.repeat.set(3, 3)
  const caustic = new THREE.Mesh(
    new THREE.CircleGeometry(70, 32),
    new THREE.MeshBasicMaterial({
      map: causticMap,
      transparent: true,
      depthWrite: false,
      opacity: 0.28,
      color: 0xd8fff4
    })
  )
  caustic.rotation.x = -Math.PI / 2
  caustic.position.y = 16.28
  const bubbles: { sprite: THREE.Sprite; rise: number }[] = []
  const bubbleCanvas = document.createElement('canvas')
  bubbleCanvas.width = 32
  bubbleCanvas.height = 32
  const bubbleCtx = bubbleCanvas.getContext('2d')
  if (bubbleCtx) {
    bubbleCtx.strokeStyle = 'rgba(230, 248, 255, 0.9)'
    bubbleCtx.lineWidth = 2
    bubbleCtx.beginPath()
    bubbleCtx.arc(16, 16, 10, 0, Math.PI * 2)
    bubbleCtx.stroke()
  }
  const bubbleMap = new THREE.CanvasTexture(bubbleCanvas)
  for (let i = 0; i < 10; i++) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: bubbleMap,
      transparent: true,
      depthWrite: false,
      opacity: 0.65
    }))
    const size = 0.18 + (i % 3) * 0.08
    sprite.scale.set(size, size, 1)
    sprite.position.set(((i * 37) % 17) - 8, 16.8 + (i % 5) * 0.7, ((i * 19) % 17) - 8)
    rig.add(sprite)
    bubbles.push({ sprite, rise: 0.55 + (i % 4) * 0.22 })
  }
  rig.add(sand, caustic)
  scene.add(rig)

  let seated = false
  let veiled = false
  let level = 1
  let eaten = 0
  let attempt = 0
  let acked = false
  let leaveAt = 0
  const waterFog = new THREE.Fog(0x0b4f78, 6, 42)
  const waterBg = new THREE.Color(0x08324e)
  let savedFog: THREE.Fog | THREE.FogExp2 | null = null
  let savedBg: THREE.Color | null = null
  const aim = new THREE.Vector3()

  const paint = () => {
    const playing = !!document.querySelector('.menu')?.classList.contains('hidden')
    if (hud) {
      hud.hidden = !playing || !control.swimming
      hud.textContent = `鱼 Lv.${level} ${SPECIES[level]}  已吃 ${eaten}  上岸 +${eaten}`
    }
    if (ashoreButton) ashoreButton.hidden = !playing || !control.swimming
    const map = maps[level]
    if (map) selfMat.map = map
    const span = 0.72 + level * 0.36
    selfFish.scale.set(span * 1.35, span, 1)
    reef.visible = control.swimming
    rig.visible = control.swimming
    selfFish.visible = control.swimming
  }

  const requestLeave = () => {
    if (!control.swimming) return
    const now = performance.now()
    if (now - leaveAt < 700) return
    leaveAt = now
    arena.send({ type: 'swim', on: false })
  }

  const leave = (x: number, y: number, z: number) => {
    attempt += 1
    control.swimming = false
    camera.position.set(x, y, z)
    control.velocity.set(0, 0, 0)
    if (savedFog) scene.fog = savedFog
    if (savedBg) scene.background = savedBg
    level = 1
    eaten = 0
    onLevel(1)
    paint()
  }

  const enter = () => {
    if (control.swimming || control.ride || control.flying || control.room || blocked()) return
    const floor = ground(camera.position.x, camera.position.z)
    if (floor >= SEA - 0.2) {
      note('这里不是海，到水面上再跳')
      return
    }
    const token = ++attempt
    acked = false
    control.swimming = true
    control.velocity.y = 0
    camera.position.y = 19.2
    if (scene.fog instanceof THREE.Fog || scene.fog instanceof THREE.FogExp2) savedFog = scene.fog
    if (scene.background instanceof THREE.Color) savedBg = scene.background
    scene.fog = waterFog
    scene.background = waterBg
    camera.getWorldDirection(aim)
    arena.send({
      type: 'pose',
      x: camera.position.x,
      y: 25.3,
      z: camera.position.z,
      yaw: Math.atan2(aim.x, aim.z),
      dx: aim.x,
      dy: aim.y,
      dz: aim.z
    })
    arena.send({ type: 'swim', on: true })
    note('跳进海里，变成了鱼。吃掉不比你大的鱼会升级，上岸后它们变成队友')
    paint()
    window.setTimeout(() => {
      if (token !== attempt || !control.swimming || acked) return
      requestLeave()
      leave(camera.position.x, Math.max(ground(camera.position.x, camera.position.z), SEA) + 2.4, camera.position.z)
      note('没进到海里')
    }, 2500)
  }

  const seat = () => {
    const spots: { x: number; z: number }[] = []
    for (let x = -168; x <= 168; x += 4) {
      for (let z = 12; z <= 252; z += 4) {
        if (ground(x, z) <= 25) spots.push({ x, z })
      }
    }
    const stride = Math.max(1, Math.floor(spots.length / props.length))
    props.forEach((prop, index) => {
      const spot = spots[(index * stride) % Math.max(1, spots.length)]
      if (!spot) return
      prop.x = spot.x
      prop.z = spot.z
      prop.sprite.visible = true
      prop.sprite.position.set(spot.x, prop.y, spot.z)
    })
    seated = true
  }

  arena.handlers.onFish = (next, count, name, grew) => {
    if (!control.swimming) return
    acked = true
    level = next
    eaten = count
    onLevel(next)
    if (grew) note(`升级成 ${name}，体型变大了`)
    paint()
  }
  arena.handlers.onAshore = (x, y, z) => {
    acked = true
    leave(x, y, z)
  }
  ashoreButton?.addEventListener('click', () => requestLeave())

  const veil = () => {
    if (!control.swimming) {
      if (!veiled) return
      for (const child of scene.children) {
        if (child.userData.diveHidden) {
          child.visible = true
          delete child.userData.diveHidden
        }
      }
      veiled = false
      return
    }
    veiled = true
    for (const child of scene.children) {
      if (child === reef || child === rig || child === selfFish) continue
      if (child.userData.shape === 'fish') continue
      if ((child as THREE.Light).isLight) continue
      if (!child.visible) continue
      child.userData.diveHidden = true
      child.visible = false
    }
  }

  return {
    veil,
    update(dt: number) {
      const playing = !!document.querySelector('.menu')?.classList.contains('hidden')
      if (playing && !seated && typeof arena.seed === 'number') seat()
      if (!control.swimming && control.justJumped && !control.ride && !control.flying && !control.room && !blocked()) {
        const floor = ground(camera.position.x, camera.position.z)
        if (floor < SEA - 0.2) enter()
      }
      control.justJumped = false
      if (!control.swimming) {
        paint()
        return
      }
      camera.getWorldDirection(aim)
      const forward = Math.hypot(aim.x, aim.z) || 1
      const speed = 6.5 + level * 1.35
      if (control.velocity.x > 0.4) {
        camera.position.x += (aim.x / forward) * speed * dt
        camera.position.z += (aim.z / forward) * speed * dt
      } else if (control.velocity.x < -0.4) {
        camera.position.x -= (aim.x / forward) * speed * 0.6 * dt
        camera.position.z -= (aim.z / forward) * speed * 0.6 * dt
      }
      const rise = aim.y * 5.5 + (control.spaceHolding ? 1.8 : 0)
      camera.position.y = Math.min(DIVE_HI, Math.max(DIVE_LO, camera.position.y + rise * dt))
      if (ground(camera.position.x, camera.position.z) > SEA + 0.15) requestLeave()
      const side = new THREE.Vector3(aim.z, 0, -aim.x)
      if (side.lengthSq() > 0.0001) side.normalize()
      selfFish.position.copy(camera.position).addScaledVector(aim, 2.35).addScaledVector(side, 0.72)
      selfFish.position.y = camera.position.y - 0.72
      rig.position.x = camera.position.x
      rig.position.z = camera.position.z
      causticMap.offset.x += dt * 0.05
      causticMap.offset.y += dt * 0.02
      for (const bubble of bubbles) {
        bubble.sprite.position.y += bubble.rise * dt
        if (bubble.sprite.position.y > 22) bubble.sprite.position.y = 16.6
      }
      paint()
    }
  }
}
