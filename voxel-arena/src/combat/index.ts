import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import * as SkeletonTools from 'three/examples/jsm/utils/SkeletonUtils.js'
import Terrain from '../terrain'
import Control from '../control'
import { arena, FighterState } from '../arena/net'
import { landmarks } from '../../landmarks.js'
import { airport } from '../../airport.js'
import { caveSites } from '../../caves.js'
import { ladderAt } from '../world/slide'

type Gun = {
  id: string
  name: string
  damage: number
  delay: number
  mag: number
  reserve: number
  spread: number
  pellets: number
  range: number
  auto: boolean
  scopeFov: number
}

const GUNS: Gun[] = [
  { id: 'rifle', name: '步枪', damage: 18, delay: 0.16, mag: 24, reserve: 96, spread: 0.012, pellets: 1, range: 80, auto: false, scopeFov: 34 },
  { id: 'shotgun', name: '霰弹枪', damage: 8, delay: 0.72, mag: 6, reserve: 30, spread: 0.09, pellets: 7, range: 26, auto: false, scopeFov: 46 },
  { id: 'smg', name: '冲锋枪', damage: 8, delay: 0.08, mag: 32, reserve: 160, spread: 0.035, pellets: 1, range: 42, auto: true, scopeFov: 40 },
  { id: 'sniper', name: '狙击枪', damage: 86, delay: 1.15, mag: 5, reserve: 20, spread: 0.001, pellets: 1, range: 140, auto: false, scopeFov: 14 },
  { id: 'knife', name: '小刀', damage: 42, delay: 0.45, mag: 1, reserve: 1, spread: 0.02, pellets: 1, range: 3.4, auto: false, scopeFov: 48 }
]

export default class Combat {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  terrain: Terrain
  control: Control
  gunIndex = 0
  rideId: string | null = null
  foxTemplate: THREE.Object3D | null = null
  foxClips: THREE.AnimationClip[] = []
  skinId = ''
  onSkin?: (id: string) => void
  vehicleMeshes = new Map<string, THREE.Group>()
  ammo: { mag: number; reserve: number }[]
  cool = 0
  hp = 100
  tracers: { mesh: THREE.Mesh; from: THREE.Vector3; to: THREE.Vector3; life: number; max: number }[] = []
  scoped = false
  glass = false
  hipFov = 50
  drumOn = false
  unlocked = new Set(['rifle'])
  grenades = 0
  pickupMeshes = new Map<string, THREE.Mesh>()
  claimed = new Set<string>()
  mapCanvas: HTMLCanvasElement
  mapCtx: CanvasRenderingContext2D | null
  sidesLabel: HTMLElement
  duelLabel: HTMLElement
  shop: HTMLElement
  shopMoney: HTMLElement
  payGold = false
  vestSynced = false
  pitHead: THREE.Texture | null = null
  fishLevel = 1
  fishMaps: Array<THREE.Texture | null> = []
  jumpIntoTrap = false
  trapHint = false
  streakGeo = new THREE.BoxGeometry(1, 1, 1)
  streakMat = new THREE.MeshBasicMaterial({ color: '#ff9a1f' })
  aimAxis = new THREE.Vector3(0, 0, 1)
  scopeEl: HTMLElement
  muzzleEl: HTMLElement
  figures = new Map<string, THREE.Group>()
  trapMeshes = new Map<string, THREE.Group>()
  inPit = false
  pitRoom: THREE.Group | null = null
  pitSaved = false
  dayFog: THREE.Fog | null = null
  dayBackground: THREE.Color | null = null
  pitFog = new THREE.Fog(0x050508, 4, 16)
  pitColor = new THREE.Color(0x050508)
  pitLightRestore: { light: THREE.Light; intensity: number }[] | null = null
  ray = new THREE.Raycaster()
  hud: HTMLElement
  gunLabel: HTMLElement
  hpLabel: HTMLElement
  feed: HTMLElement
  marker: HTMLElement
  down = false
  downT = 0
  viewmodel: THREE.Group
  flash: THREE.PointLight

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, terrain: Terrain, control: Control) {
    this.scene = scene
    this.camera = camera
    this.terrain = terrain
    this.control = control
    this.ammo = GUNS.map(gun => ({ mag: gun.mag, reserve: gun.reserve }))
    this.hud = document.querySelector('#combat') as HTMLElement
    this.gunLabel = document.querySelector('#gun') as HTMLElement
    this.hpLabel = document.querySelector('#hp') as HTMLElement
    this.feed = document.querySelector('#feed') as HTMLElement
    this.marker = document.querySelector('#hitmark') as HTMLElement
    this.scopeEl = document.querySelector('#scope-ov') as HTMLElement
    this.muzzleEl = document.querySelector('#muzzle') as HTMLElement
    this.mapCanvas = document.querySelector('#minimap') as HTMLCanvasElement
    this.mapCtx = this.mapCanvas?.getContext('2d') || null
    this.sidesLabel = document.querySelector('#sides') as HTMLElement
    this.duelLabel = document.querySelector('#duel') as HTMLElement
    this.shop = document.querySelector('#shop') as HTMLElement
    this.shopMoney = document.querySelector('#shop-money') as HTMLElement
    this.hipFov = camera.fov || 50
    this.pitHead = new THREE.TextureLoader().load('faces/pit-head.png')
    this.pitHead.encoding = THREE.sRGBEncoding
    const fishTiles = ['', '074', '073', '081', '078', '101']
    this.fishMaps = fishTiles.map(tile => {
      if (!tile) return null
      const map = new THREE.TextureLoader().load(`fish/fishTile_${tile}.png`)
      map.encoding = THREE.sRGBEncoding
      return map
    })
    this.viewmodel = this.makeViewmodel()
    camera.add(this.viewmodel)
    this.flash = new THREE.PointLight('#ffd2a1', 0, 8, 2)
    this.flash.position.set(0.25, -0.15, -0.6)
    camera.add(this.flash)
    window.addEventListener('keydown', this.onKey)
    window.addEventListener('keyup', event => {
      if (event.key === 'x' || event.key === 'X') this.control.mining = false
    })
    arena.handlers.onSnapshot = (_players, _bots, hp) => {
      this.hp = hp
      if (hp > 0) this.down = false
      this.showPurse()
      this.syncFigures()
      this.syncRide()
      if (arena.skin && arena.skin !== this.skinId) {
        this.skinId = arena.skin
        this.onSkin?.(arena.skin)
      }
    }
    arena.handlers.onDrive = (id, kind, speed, name) => {
      if (!id || !kind) {
        this.leaveRide('exit')
        return
      }
      this.rideId = id
      this.control.setRide(kind, speed || 0)
      const button = document.querySelector('#drive')
      if (kind === 'car' || kind === 'plane') {
        if (button) button.textContent = '退出'
        this.pushFeed(kind === 'plane' ? '已进入飞机。按「开」退出' : '已进入汽车。按「开」退出')
      } else {
        if (button) button.textContent = '下'
        this.pushFeed(`开上${name || '车'}，速度 ${speed}`)
      }
      this.paintRideHint()
    }
    arena.handlers.onEject = () => {
      this.leaveRide('eject')
    }
    arena.handlers.onPit = () => {
      this.inPit = true
      if (!this.pitRoom) this.pitRoom = this.makePit()
      this.holdPit()
    }
    arena.handlers.onSurface = (x, y, z) => {
      this.leavePit()
      this.camera.position.set(x, y, z)
      this.control.velocity.set(0, 0, 0)
    }
    arena.handlers.onFeed = text => this.pushFeed(text)
    arena.handlers.onDown = () => {
      this.down = true
      this.downT = 2.2
      this.pushFeed('你被打倒了')
    }
    arena.handlers.onLoot = kind => this.takeLoot(kind)
    arena.handlers.onWallet = (money, item, shop) => this.takeWallet(money, item, shop)
    this.paint()
    new GLTFLoader().load('animals/Fox.glb', gltf => {
      this.foxTemplate = gltf.scene
      this.foxClips = gltf.animations
    })
  }

  gun() {
    return GUNS[this.gunIndex]
  }

  makeViewmodel() {
    const group = new THREE.Group()
    const metal = new THREE.MeshStandardMaterial({ color: '#2c3138', roughness: 0.4, metalness: 0.45 })
    const wood = new THREE.MeshStandardMaterial({ color: '#8a5a32', roughness: 0.8 })
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.62), metal)
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.1), wood)
    grip.position.set(0, -0.12, 0.12)
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.28), metal)
    barrel.position.set(0, 0.04, -0.4)
    group.add(body, grip, barrel)
    group.position.set(0.28, -0.28, -0.55)
    return group
  }

  tagFigure(group: THREE.Group, state: FighterState, barColor: string, barY: number) {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.09, 0.04),
      new THREE.MeshBasicMaterial({ color: barColor })
    )
    bar.position.set(0, barY, 0)
    group.add(bar)
    group.userData.bar = bar
    group.traverse(obj => {
      obj.userData.fighterId = state.id
    })
    group.userData.fighterId = state.id
    this.scene.add(group)
    return group
  }

  makeFigure(state: FighterState) {
    if (state.shape === 'fish') return this.makeFish(state)
    if (state.shape === 'squid') return this.tagFigure(this.makeSquid(), state, '#e24b3a', 2.75)
    if (state.shape === 'mimic') return this.tagFigure(this.makeMimic(), state, '#39ffc6', 3.2)
    if (state.shape === 'fox' || state.shape === 'sheep' || state.shape === 'rabbit') {
      const group = this.makeFox()
      group.traverse(obj => {
        obj.userData.fighterId = state.id
      })
      group.userData.fighterId = state.id
      this.scene.add(group)
      return group
    }
    const side = state.team === 'enemy' ? 'enemy' : 'ally'
    const group = state.shape === 'bug' || state.team === 'enemy' ? this.makeBug(side) : this.makePerson()
    const hostile = state.team === 'enemy'
    return this.tagFigure(group, state, hostile ? '#e24b3a' : '#3dba6a', 2.15)
  }

  makeSquid() {
    const group = new THREE.Group()
    const bodyMat = new THREE.MeshStandardMaterial({ color: '#6a3d78', roughness: 0.45, emissive: '#2a1038', emissiveIntensity: 0.4 })
    const belly = new THREE.MeshStandardMaterial({ color: '#e7d2c4', roughness: 0.55 })
    const eyeWhite = new THREE.MeshStandardMaterial({ color: '#f4f7ff' })
    const pupil = new THREE.MeshStandardMaterial({ color: '#14080c', emissive: '#401018', emissiveIntensity: 0.5 })
    const mantle = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 12), bodyMat)
    mantle.scale.set(1, 1.35, 1.05)
    mantle.position.y = 1.55
    const underside = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10), belly)
    underside.position.y = 0.9
    for (let i = 0; i < 8; i++) {
      const tentacle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.02, 1.15, 6), bodyMat)
      const ang = (i / 8) * Math.PI * 2
      tentacle.position.set(Math.cos(ang) * 0.4, 0.38, Math.sin(ang) * 0.4)
      tentacle.rotation.z = Math.cos(ang) * 0.55
      tentacle.rotation.x = Math.sin(ang) * 0.55
      group.add(tentacle)
    }
    for (const x of [-0.3, 0.3]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), eyeWhite)
      eye.position.set(x, 1.4, 0.66)
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), pupil)
      dot.position.set(x, 1.4, 0.78)
      group.add(eye, dot)
    }
    group.add(mantle, underside)
    return group
  }

  makeMimic() {
    const group = new THREE.Group()
    const skin = new THREE.MeshStandardMaterial({
      color: '#8effd8',
      emissive: '#0c6a50',
      emissiveIntensity: 0.7,
      roughness: 0.7
    })
    const cloth = new THREE.MeshStandardMaterial({
      color: '#101816',
      emissive: '#06281f',
      emissiveIntensity: 0.45,
      roughness: 0.92
    })
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.7, 0.26), cloth)
    body.position.y = 1.02
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.22, 0.14), skin)
    neck.position.y = 1.9
    const face = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.pitHead,
      transparent: true,
      depthWrite: false
    }))
    face.scale.set(0.98, 1.38, 1)
    face.position.y = 2.42
    group.add(body, neck, face)
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.6, 0.08), skin)
      arm.position.set(side * 0.36, 0.62, 0.04)
      arm.rotation.z = side * -0.28
      group.add(arm)
    }
    return group
  }

  makeLevelTag(level: number) {
    const canvas = document.createElement('canvas')
    canvas.width = 160
    canvas.height = 64
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.fillStyle = 'rgba(4, 16, 28, 0.82)'
      ctx.fillRect(6, 8, 148, 48)
      ctx.lineWidth = 6
      ctx.strokeStyle = '#042033'
      ctx.fillStyle = '#ffe14a'
      ctx.font = 'bold 36px sans-serif'
      ctx.textAlign = 'center'
      ctx.strokeText(`Lv.${level}`, 80, 44)
      ctx.fillText(`Lv.${level}`, 80, 44)
    }
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(canvas),
      transparent: true,
      depthWrite: false
    }))
    tag.scale.set(1.55, 0.62, 1)
    return tag
  }

  makeFish(state: FighterState) {
    const level = Math.min(5, Math.max(1, state.level || 1))
    const group = new THREE.Group()
    const map = this.fishMaps[level]
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: map || undefined,
      transparent: true,
      depthWrite: false,
      alphaTest: 0.35
    }))
    const span = 0.9 + level * 0.55
    sprite.scale.set(span * 1.5, span, 1)
    sprite.position.y = span * 0.35
    const tag = this.makeLevelTag(level)
    tag.position.y = span + 0.55
    group.add(sprite, tag)
    const danger = level > this.fishLevel
    const figure = this.tagFigure(group, state, danger ? '#e24b3a' : '#7dff6a', span + 1.05)
    figure.userData.shape = 'fish'
    return figure
  }

  makePit() {
    const room = new THREE.Group()
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(22, 12, 22),
      new THREE.MeshBasicMaterial({ color: 0x050508, side: THREE.BackSide })
    )
    wall.position.y = 4.2
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(10.5, 24),
      new THREE.MeshBasicMaterial({ color: 0x10080c })
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.y = 0.02
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.1, 2.55, 24),
      new THREE.MeshBasicMaterial({ color: 0x6a1020, side: THREE.DoubleSide })
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.04
    const glow = new THREE.PointLight(0xff2208, 2.4, 16, 2)
    glow.position.set(0, 3.1, 0)
    room.add(wall, floor, ring, glow)
    room.userData.glow = glow
    room.userData.ring = ring
    room.visible = false
    this.scene.add(room)
    return room
  }

  holdPit() {
    if (!this.pitRoom) this.pitRoom = this.makePit()
    if (!this.pitSaved) {
      this.dayFog = this.scene.fog instanceof THREE.Fog ? this.scene.fog : null
      this.dayBackground = this.scene.background instanceof THREE.Color ? this.scene.background : null
      this.pitSaved = true
    }
    const keep = new Set<THREE.Object3D>([this.pitRoom])
    for (const figure of this.figures.values()) keep.add(figure)
    for (const tracer of this.tracers) keep.add(tracer.mesh)
    for (const child of this.scene.children) {
      if (keep.has(child)) continue
      if ((child as THREE.Light).isLight) continue
      if (child.visible) {
        child.userData.pitHidden = true
        child.visible = false
      }
    }
    for (const [id, figure] of this.figures) {
      const fighter = [...arena.players, ...arena.bots].find(item => item.id === id)
      if (fighter?.shape !== 'mimic') {
        figure.visible = false
        figure.userData.pitHidden = true
      }
    }
    const glow = this.pitRoom.userData.glow as THREE.PointLight
    const ring = this.pitRoom.userData.ring as THREE.Mesh
    const pulse = 0.55 + Math.sin(performance.now() / 170) * 0.45
    glow.intensity = 1.6 + pulse
    ;(ring.material as THREE.MeshBasicMaterial).color.setRGB(0.45 * pulse, 0.04 * pulse, 0.08 * pulse)
    if (!this.pitLightRestore) {
      const saved: { light: THREE.Light; intensity: number }[] = []
      this.scene.traverse(obj => {
        const light = obj as THREE.Light
        if (!light.isLight || light === glow) return
        saved.push({ light, intensity: light.intensity })
        light.intensity = 0
      })
      this.pitLightRestore = saved
    }
    this.pitRoom.visible = true
    this.pitRoom.position.set(this.camera.position.x, this.camera.position.y - 1.65, this.camera.position.z)
    this.scene.fog = this.pitFog
    this.scene.background = this.pitColor
  }

  leavePit() {
    this.inPit = false
    if (this.pitRoom) this.pitRoom.visible = false
    for (const child of this.scene.children) {
      if (child.userData.pitHidden) {
        child.visible = true
        child.userData.pitHidden = false
      }
    }
    if (this.pitSaved) {
      if (this.dayFog) this.scene.fog = this.dayFog
      if (this.dayBackground) this.scene.background = this.dayBackground
      this.dayFog = null
      this.dayBackground = null
      this.pitSaved = false
    }
    if (this.pitLightRestore) {
      for (const item of this.pitLightRestore) item.light.intensity = item.intensity
      this.pitLightRestore = null
    }
  }

  makeFox() {
    const group = new THREE.Group()
    if (!this.foxTemplate) {
      group.userData.pendingFox = true
      return group
    }
    const model = (SkeletonTools as unknown as { clone: (source: THREE.Object3D) => THREE.Object3D }).clone(this.foxTemplate)
    const box = new THREE.Box3().setFromObject(model)
    const fit = 1.15 / Math.max(0.001, box.getSize(new THREE.Vector3()).y)
    model.scale.setScalar(fit)
    model.position.y = -box.min.y * fit
    const mixer = new THREE.AnimationMixer(model)
    const surveyClip = THREE.AnimationClip.findByName(this.foxClips, 'Survey')
    const walkClip = THREE.AnimationClip.findByName(this.foxClips, 'Walk')
    const survey = surveyClip ? mixer.clipAction(surveyClip) : null
    const walk = walkClip ? mixer.clipAction(walkClip) : null
    survey?.play()
    group.add(model)
    group.userData.mixer = mixer
    group.userData.survey = survey
    group.userData.walk = walk
    group.userData.clip = 'survey'
    return group
  }

  makeSheep() {
    const group = new THREE.Group()
    const wool = new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.9 })
    const skin = new THREE.MeshStandardMaterial({ color: '#2b2b2b', roughness: 0.6 })
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 10), wool)
    body.scale.set(1.15, 0.85, 1.35)
    body.position.y = 0.55
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.32), skin)
    head.position.set(0, 0.72, 0.42)
    this.addAnimalFace(head, '#f3c2c8', 0.18)
    group.add(body, head)
    return group
  }

  makeRabbit() {
    const group = new THREE.Group()
    const fur = new THREE.MeshStandardMaterial({ color: '#c47a45', roughness: 0.75 })
    const belly = new THREE.MeshStandardMaterial({ color: '#f3e2cf', roughness: 0.8 })
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), fur)
    body.scale.set(0.9, 0.8, 1.25)
    body.position.y = 0.38
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), fur)
    head.position.set(0, 0.48, 0.28)
    this.addAnimalFace(head, '#e8899a', 0.12)
    const earMat = new THREE.MeshStandardMaterial({ color: '#f4c7d0' })
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.28, 0.04), fur)
      ear.position.set(side * 0.06, 0.78, 0.26)
      const inner = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.18, 0.02), earMat)
      inner.position.set(side * 0.06, 0.78, 0.29)
      group.add(ear, inner)
    }
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), belly)
    tail.position.set(0, 0.4, -0.32)
    group.add(body, head, tail)
    return group
  }

  addAnimalFace(head: THREE.Object3D, noseColor: string, z: number) {
    const white = new THREE.MeshStandardMaterial({ color: '#fffdf8' })
    const pupil = new THREE.MeshStandardMaterial({ color: '#1a1a1a' })
    const nose = new THREE.MeshStandardMaterial({ color: noseColor })
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), white)
      eye.position.set(side * 0.07, 0.04, z)
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 8), pupil)
      dot.position.set(side * 0.07, 0.04, z + 0.03)
      head.add(eye, dot)
    }
    const noseMesh = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), nose)
    noseMesh.position.set(0, -0.04, z + 0.02)
    head.add(noseMesh)
  }

  makePerson() {
    const group = new THREE.Group()
    const cloth = new THREE.MeshStandardMaterial({ color: '#3d7ec4', roughness: 0.55 })
    const skin = new THREE.MeshStandardMaterial({ color: '#f3c7a2', roughness: 0.62 })
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.05, 0.36), cloth)
    body.position.y = 0.95
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.44, 0.4), skin)
    head.position.y = 1.72
    this.addHumanFace(head)
    const gun = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.12, 0.55),
      new THREE.MeshStandardMaterial({ color: '#2a3038', metalness: 0.4, roughness: 0.4 })
    )
    gun.position.set(0.36, 1.15, 0.25)
    group.add(body, head, gun)
    return group
  }

  addHumanFace(head: THREE.Object3D) {
    const white = new THREE.MeshStandardMaterial({ color: '#fffcf8' })
    const pupil = new THREE.MeshStandardMaterial({ color: '#1b1b1b' })
    const brow = new THREE.MeshStandardMaterial({ color: '#4a3428' })
    const nose = new THREE.MeshStandardMaterial({ color: '#e7b48d' })
    const mouth = new THREE.MeshStandardMaterial({ color: '#c45b62' })
    const z = 0.22
    const eye = (x: number) => {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), white)
      ball.position.set(x, 0.06, z)
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.026, 10, 8), pupil)
      dot.position.set(x, 0.055, z + 0.04)
      const browMesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.025, 0.02), brow)
      browMesh.position.set(x, 0.14, z)
      head.add(ball, dot, browMesh)
    }
    eye(-0.09)
    eye(0.09)
    const noseMesh = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.07, 0.06), nose)
    noseMesh.position.set(0, -0.01, z)
    const mouthMesh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.03), mouth)
    mouthMesh.position.set(0, -0.12, z)
    head.add(noseMesh, mouthMesh)
  }

  makeBug(team: 'enemy' | 'ally') {
    const group = new THREE.Group()
    const paint = team === 'enemy'
      ? { shell: '#e10600', belly: '#ff8f86', feeler: '#6a0c0c', nose: '#7a1420', jaw: '#4a0810', pupil: '#1a0000', eye: '#fff4f2', mouth: '#4a0810' }
      : { shell: '#1fa85a', belly: '#e4f7b8', feeler: '#0e4d28', nose: '#146b38', jaw: '#0e4d28', pupil: '#062010', eye: '#f4fff0', mouth: '#8d3040' }
    const shell = new THREE.MeshStandardMaterial({
      color: paint.shell,
      roughness: 0.42,
      emissive: team === 'enemy' ? '#5a0000' : '#063018',
      emissiveIntensity: 0.4
    })
    const belly = new THREE.MeshStandardMaterial({ color: paint.belly, roughness: 0.55 })
    const abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), shell)
    abdomen.scale.set(0.9, 0.75, 1.15)
    abdomen.position.set(0, 0.55, -0.15)
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.5), belly)
    stripe.position.set(0, 0.62, -0.1)
    const thorax = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), shell)
    thorax.position.set(0, 0.85, 0.22)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), shell)
    head.position.set(0, 1.15, 0.42)
    this.addBugFace(head, paint)
    const feelerMat = new THREE.MeshStandardMaterial({ color: paint.feeler })
    for (const side of [-1, 1]) {
      const feeler = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.42, 6), feelerMat)
      feeler.position.set(side * 0.1, 1.48, 0.42)
      feeler.rotation.z = side * 0.4
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), feelerMat)
      tip.position.set(side * 0.18, 1.66, 0.42)
      group.add(feeler, tip)
    }
    group.add(abdomen, stripe, thorax, head)
    return group
  }

  addBugFace(head: THREE.Object3D, paint: { eye: string; pupil: string; nose: string; mouth: string; jaw: string }) {
    const white = new THREE.MeshStandardMaterial({ color: paint.eye })
    const pupil = new THREE.MeshStandardMaterial({ color: paint.pupil })
    const nose = new THREE.MeshStandardMaterial({ color: paint.nose })
    const mouth = new THREE.MeshStandardMaterial({ color: paint.mouth })
    const jaw = new THREE.MeshStandardMaterial({ color: paint.jaw })
    const z = 0.22
    const eye = (x: number) => {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 12), white)
      ball.position.set(x, 0.04, z)
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), pupil)
      dot.position.set(x, 0.03, z + 0.06)
      head.add(ball, dot)
    }
    eye(-0.1)
    eye(0.1)
    const noseMesh = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), nose)
    noseMesh.position.set(0, -0.04, z + 0.02)
    const mouthMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.035, 0.04), mouth)
    mouthMesh.position.set(0, -0.13, z)
    for (const side of [-1, 1]) {
      const mandible = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.03), jaw)
      mandible.position.set(side * 0.08, -0.18, z)
      mandible.rotation.z = side * -0.3
      head.add(mandible)
    }
    head.add(noseMesh, mouthMesh)
  }

  syncFigures() {
    const all = [...arena.players.filter(p => p.id !== arena.id), ...arena.bots]
    const seen = new Set<string>()
    for (const fighter of all) {
      seen.add(fighter.id)
      let figure = this.figures.get(fighter.id)
      if (!figure) {
        figure = this.makeFigure(fighter)
        this.figures.set(fighter.id, figure)
      }
      const animal = fighter.shape === 'fox' || fighter.shape === 'sheep' || fighter.shape === 'rabbit' || fighter.shape === 'squid' || fighter.shape === 'fish'
      if (figure.userData.pendingFox && this.foxTemplate) {
        this.scene.remove(figure)
        figure = this.makeFigure(fighter)
        this.figures.set(fighter.id, figure)
      }
      const diving = this.control.swimming
      figure.visible = diving && fighter.shape !== 'fish' ? false : fighter.alive && fighter.hp > 0
      const bob = fighter.shape === 'squid' || fighter.shape === 'fish' ? Math.sin(performance.now() / 420 + fighter.x) * 0.12 : 0
      const lifted = fighter.shape === 'fish' && diving ? 17.8 + (fighter.level || 1) * 0.32 : animal ? fighter.y : fighter.y - 1.6
      figure.position.set(fighter.x, lifted + bob, fighter.z)
      figure.rotation.y = fighter.yaw
      const mixer = figure.userData.mixer as THREE.AnimationMixer | undefined
      if (mixer) {
        const want = fighter.lead ? 'walk' : 'survey'
        if (figure.userData.clip !== want) {
          const next = want === 'walk' ? figure.userData.walk : figure.userData.survey
          const prev = want === 'walk' ? figure.userData.survey : figure.userData.walk
          if (next) next.reset().fadeIn(0.2).play()
          if (prev) prev.fadeOut(0.2)
          figure.userData.clip = want
        }
        mixer.update(1 / 60)
      }
      const bar = figure.userData.bar as THREE.Mesh | undefined
      const max = fighter.maxHp || 80
      const ratio = Math.max(0.04, fighter.hp / max)
      if (bar) {
        bar.scale.x = ratio
        bar.position.x = (ratio - 1) * 0.4
        if (fighter.shape === 'fish') {
          const mat = bar.material as THREE.MeshBasicMaterial
          mat.color.set((fighter.level || 1) > this.fishLevel ? '#e24b3a' : '#7dff6a')
        }
      }
    }
    for (const [id, figure] of this.figures) {
      if (!seen.has(id)) {
        this.scene.remove(figure)
        this.figures.delete(id)
      }
    }
  }

  onKey = (event: KeyboardEvent) => {
    const index = Number(event.key) - 1
    if (index >= 0 && index < GUNS.length && this.unlocked.has(GUNS[index].id)) this.gunIndex = index
    if (event.key === 'g' || event.key === 'G') this.throwGrenade()
    if ((event.key === 'f' || event.key === 'F') && !event.repeat) this.tryFeed()
    if ((event.key === 'v' || event.key === 'V') && !event.repeat) this.tryDrive()
    if ((event.key === 'l' || event.key === 'L') && !event.repeat) this.onLadder?.()
    if (event.key === 'r' || event.key === 'R') this.reload()
    if ((event.key === 'c' || event.key === 'C') && !event.repeat) this.toggleScope()
    if (event.key === 'x' || event.key === 'X') this.control.mining = true
    this.paint()
  }

  cap(index = this.gunIndex) {
    return GUNS[index].mag + (this.drumOn ? 12 : 0)
  }

  reload() {
    const pool = this.ammo[this.gunIndex]
    const need = this.cap() - pool.mag
    const take = Math.min(Math.max(0, need), pool.reserve)
    pool.mag += take
    pool.reserve -= take
    this.paint()
  }

  cycle() {
    for (let step = 0; step < GUNS.length; step++) {
      this.gunIndex = (this.gunIndex + 1) % GUNS.length
      if (this.unlocked.has(GUNS[this.gunIndex].id)) break
    }
    this.paint()
    this.paintScope()
  }

  toggleScope() {
    const playing = !!document.querySelector('.menu')?.classList.contains('hidden')
    if (!playing) return
    if (!this.scoped) this.hipFov = this.control.baseFov || this.camera.fov || 50
    this.scoped = !this.scoped
    this.control.lookScale = this.scoped ? 0.34 : 1
    const lock = this.control.control as THREE.EventDispatcher & { lookScale?: number }
    lock.lookScale = this.control.lookScale
    this.paintScope()
  }

  paintScope() {
    const show = this.scoped && !!document.querySelector('.menu')?.classList.contains('hidden')
    this.scopeEl?.classList.toggle('show', show)
    this.viewmodel.visible = !show
    document.querySelector('[data-act="scope"]')?.classList.toggle('on', this.scoped)
    const hair = document.querySelector('.cross-hair')
    if (document.querySelector('.menu')?.classList.contains('hidden')) {
      hair?.classList.toggle('hidden', this.scoped)
    }
  }

  pullTrigger() {
    this.tryFire(false)
  }

  tryFire(fromAuto: boolean) {
    if (this.control.swimming) return
    const gun = this.gun()
    if (fromAuto && !gun.auto) return
    if (this.down || this.cool > 0) return
    if (!this.unlocked.has(gun.id)) return
    const pool = this.ammo[this.gunIndex]
    if (gun.id !== 'knife') {
      if (pool.mag <= 0) {
        this.reload()
        return
      }
      pool.mag -= 1
    }
    this.cool = gun.delay
    this.flash.intensity = 6
    this.viewmodel.position.z = -0.42
    this.muzzleEl?.classList.remove('go')
    void this.muzzleEl?.offsetWidth
    this.muzzleEl?.classList.add('go')
    const origin = new THREE.Vector3()
    const direction = new THREE.Vector3()
    this.camera.getWorldPosition(origin)
    this.camera.getWorldDirection(direction)
    arena.send({
      type: 'shot',
      weapon: gun.id,
      x: origin.x,
      y: origin.y,
      z: origin.z,
      dx: direction.x,
      dy: direction.y,
      dz: direction.z
    })
    const spread = (this.scoped ? gun.spread * 0.2 : gun.spread) * (this.glass ? 0.45 : 1)
    for (let pellet = 0; pellet < gun.pellets; pellet++) {
      const dir = direction.clone()
      dir.x += (Math.random() - 0.5) * spread
      dir.y += (Math.random() - 0.5) * spread
      dir.z += (Math.random() - 0.5) * spread
      dir.normalize()
      this.ray.set(origin, dir)
      this.ray.far = gun.range
      const targets: THREE.Object3D[] = [...this.terrain.blocks]
      this.figures.forEach(figure => {
        if (figure.visible) targets.push(figure)
      })
      const hit = this.ray.intersectObjects(targets, true)[0]
      const end = origin.clone().add(dir.multiplyScalar(hit ? hit.distance : gun.range))
      this.addTracer(origin, end)
      if (hit?.object.userData.fighterId) {
        this.marker.classList.add('show')
        window.setTimeout(() => this.marker.classList.remove('show'), 90)
      }
    }
    this.camera.rotation.x += gun.id === 'sniper' ? 0.03 : 0.008
    this.paint()
  }

  addTracer(from: THREE.Vector3, to: THREE.Vector3) {
    const dir = new THREE.Vector3().subVectors(to, from)
    const length = dir.length()
    const mesh = new THREE.Mesh(this.streakGeo, this.streakMat)
    mesh.scale.set(0.16, 0.16, Math.min(1.8, Math.max(0.4, length) * 0.22))
    if (length > 0.001) {
      dir.multiplyScalar(1 / length)
      mesh.quaternion.setFromUnitVectors(this.aimAxis, dir)
    }
    mesh.position.copy(from).addScaledVector(dir, 0.8)
    this.scene.add(mesh)
    this.tracers.push({
      mesh,
      from: from.clone(),
      to: to.clone(),
      life: 0.36,
      max: 0.36
    })
  }

  pushFeed(text: string) {
    const row = document.createElement('p')
    row.textContent = text
    this.feed.prepend(row)
    while (this.feed.childElementCount > 5) this.feed.lastElementChild?.remove()
  }

  paint() {
    const gun = this.gun()
    const pool = this.ammo[this.gunIndex]
    this.gunLabel.textContent = `${gun.name}  ${pool.mag} / ${pool.reserve}${this.grenades ? '  雷' + this.grenades : ''}`
    this.hpLabel.textContent = String(Math.max(0, Math.round(this.hp)))
    this.hpLabel.style.width = `${Math.max(0, this.hp)}%`
  }

  onOwned?: () => void
  onVest?: () => void
  onLadder?: () => void

  takeLoot(kind: string) {
    if (kind === 'grenade') {
      this.grenades += 1
      this.pushFeed('捡到手榴弹')
    } else {
      const index = GUNS.findIndex(gun => gun.id === kind)
      this.unlocked.add(kind)
      if (index >= 0) {
        if (kind !== 'knife') this.ammo[index].reserve += 24
        this.gunIndex = index
      }
      this.pushFeed('捡到 ' + (index >= 0 ? GUNS[index].name : kind))
      this.onOwned?.()
    }
    this.paint()
  }

  showPurse() {
    const playing = !!document.querySelector('.menu')?.classList.contains('hidden')
    const purse = document.querySelector<HTMLButtonElement>('#purse')
    if (purse) {
      purse.hidden = !playing
      purse.textContent = `钱 ${arena.money}  金 ${arena.gold}  钻 ${arena.diamond}`
    }
    if (this.shopMoney) {
      this.shopMoney.textContent = `钱 ${arena.money} · 金 ${arena.gold} · 钻 ${arena.diamond} · 饲料 ${arena.feed}`
    }
    if (arena.vest && !this.vestSynced) {
      this.vestSynced = true
      this.onVest?.()
    }
    if (arena.drum && !this.drumOn) {
      this.drumOn = true
      this.reload()
    }
    if (arena.glass) this.glass = true
    this.paintShop()
  }

  paintShop() {
    const gold = this.payGold
    document.querySelectorAll<HTMLButtonElement>('#shop [data-buy]').forEach(button => {
      const item = button.dataset.buy || ''
      const name = button.dataset.name || button.textContent || ''
      const money = Number(button.dataset.money || 0)
      const ore = Number(button.dataset.gold || 0)
      const owned = (item === 'vest' && arena.vest) || (item === 'drum' && arena.drum) || (item === 'glass' && arena.glass)
      const skinOwned = item.startsWith('skin-') && arena.skins.includes(item.slice(5))
      if (item.startsWith('sell-gold')) button.classList.toggle('poor', arena.gold < 1)
      else if (item.startsWith('sell-diamond')) button.classList.toggle('poor', arena.diamond < 1)
      else {
        button.classList.toggle('owned', owned || skinOwned)
        button.classList.toggle('poor', !(owned || skinOwned) && (gold ? arena.gold < ore : arena.money < money))
      }
      if (!button.dataset.name) return
      if (item.startsWith('skin-') && skinOwned) {
        button.textContent = arena.skin === item.slice(5) ? `${name} 穿着` : `${name} 换上`
        return
      }
      if (owned) {
        button.textContent = `${name} 已有`
        return
      }
      if (money <= 0 && ore <= 0) {
        button.textContent = name
        return
      }
      button.textContent = gold ? `${name} ${ore}金` : `${name} ${money}钱`
    })
  }

  tryFeed() {
    let nearest: FighterState | null = null
    let best = 4.2
    for (const bot of arena.bots) {
      if (bot.team !== 'pet' || !bot.alive) continue
      const dist = Math.hypot(bot.x - this.camera.position.x, bot.z - this.camera.position.z)
      if (dist < best) {
        best = dist
        nearest = bot
      }
    }
    if (!nearest) {
      this.pushFeed('附近没有狐狸')
      return
    }
    arena.send({ type: 'feedpet', id: nearest.id })
  }

  rideName(kind: string | null | undefined) {
    if (kind === 'car') return '汽车'
    if (kind === 'plane') return '飞机'
    return ''
  }

  nearestOpenRide() {
    let nearest: (typeof arena.vehicles)[number] | null = null
    let best = 3.6
    for (const ride of arena.vehicles) {
      if (ride.driver) continue
      const dist = Math.hypot(ride.x - this.camera.position.x, ride.z - this.camera.position.z)
      if (dist < best) {
        best = dist
        nearest = ride
      }
    }
    return nearest
  }

  leaveRide(how: 'exit' | 'eject') {
    const kind = this.control.ride
    this.rideId = null
    this.control.setRide(null)
    const button = document.querySelector('#drive')
    if (button) button.textContent = '开'
    const name = this.rideName(kind)
    if (name) this.pushFeed(how === 'eject' ? `${name}坏了，已退出` : `已退出${name}`)
    this.paintRideHint()
  }

  paintRideHint() {
    const hint = document.querySelector('#ride-hint')
    const button = document.querySelector('#drive')
    const playing = !!document.querySelector('.menu')?.classList.contains('hidden')
    if (!hint) return
    if (!playing) {
      hint.textContent = ''
      return
    }
    if (this.rideId) {
      const name = this.rideName(this.control.ride)
      hint.textContent = name ? `已进入${name}，按「开」退出` : ''
      if (button && name) button.textContent = '退出'
      return
    }
    const near = this.nearestOpenRide()
    const name = this.rideName(near?.kind)
    hint.textContent = name ? `按「开」进入${name}` : ''
    if (button) button.textContent = name ? '进入' : '开'
  }

  tryDrive() {
    if (this.rideId) {
      arena.send({ type: 'drive', id: null })
      return
    }
    const nearest = this.nearestOpenRide()
    if (!nearest) {
      this.pushFeed('附近没有飞机、船、摩托车或汽车')
      return
    }
    arena.send({ type: 'drive', id: nearest.id })
  }

  syncRide() {
    const mine = arena.vehicles.find(ride => ride.driver === arena.id)
    const button = document.querySelector('#drive')
    if (!mine && this.rideId) {
      const name = this.rideName(this.control.ride)
      this.rideId = null
      this.control.setRide(null)
      if (button) button.textContent = '开'
      if (name) this.pushFeed(`已退出${name}`)
    } else if (mine && this.rideId !== mine.id) {
      this.rideId = mine.id
      this.control.setRide(mine.kind, mine.speed)
      if (button) button.textContent = '下'
    } else if (button) {
      button.textContent = mine ? '下' : '开'
    }
    this.paintRideHint()
  }

  makeRide(kind: 'bike' | 'car' | 'ship' | 'plane') {
    const group = new THREE.Group()
    const dark = new THREE.MeshStandardMaterial({ color: '#1c1e22', roughness: 0.55, metalness: 0.25 })
    if (kind === 'bike') {
      const paint = new THREE.MeshStandardMaterial({ color: '#d23b2f', roughness: 0.4, metalness: 0.35 })
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 1.4), paint)
      frame.position.y = 0.42
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.4), dark)
      seat.position.set(0, 0.54, -0.08)
      for (const z of [-0.5, 0.5]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.1, 12), dark)
        wheel.rotation.z = Math.PI / 2
        wheel.position.set(0, 0.28, z)
        group.add(wheel)
      }
      group.add(frame, seat)
    } else if (kind === 'ship') {
      const wood = new THREE.MeshStandardMaterial({ color: '#8a5a32', roughness: 0.78 })
      const trim = new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.6 })
      const hull = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.42, 3.3), wood)
      hull.position.y = 0.21
      const bow = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.28, 0.7), wood)
      bow.position.set(0, 0.28, 1.85)
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.55, 1.15), trim)
      cabin.position.set(0, 0.62, -0.35)
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.5, 6), dark)
      mast.position.set(0, 1.35, 0.35)
      group.add(hull, bow, cabin, mast)
    } else if (kind === 'plane') {
      const paint = new THREE.MeshStandardMaterial({ color: '#f4f7fb', roughness: 0.42, metalness: 0.18 })
      const accent = new THREE.MeshStandardMaterial({ color: '#d23b2f', roughness: 0.45 })
      const glass = new THREE.MeshStandardMaterial({ color: '#9fd6ff', roughness: 0.12, transparent: true, opacity: 0.7 })
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.4, 2.7), paint)
      body.position.set(0, 0.72, 0)
      const nose = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.46), accent)
      nose.position.set(0, 0.74, 1.5)
      const wing = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.08, 0.58), paint)
      wing.position.set(0, 0.62, 0.1)
      const tail = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.34), paint)
      tail.position.set(0, 0.9, -1.1)
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.4), accent)
      fin.position.set(0, 1.15, -1.15)
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.28, 0.58), glass)
      cabin.position.set(0, 1.02, 0.2)
      const prop = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.08), dark)
      prop.position.set(0, 0.74, 1.78)
      group.add(body, nose, wing, tail, fin, cabin, prop)
      group.userData.prop = prop
    } else {
      const paint = new THREE.MeshStandardMaterial({ color: '#2f6fbe', roughness: 0.42, metalness: 0.22 })
      const glass = new THREE.MeshStandardMaterial({ color: '#d7f3ff', roughness: 0.12, transparent: true, opacity: 0.7 })
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.36, 2.2), paint)
      body.position.y = 0.46
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.36, 1.05), glass)
      cabin.position.set(0, 0.78, -0.08)
      for (const [x, z] of [[-0.5, -0.72], [0.5, -0.72], [-0.5, 0.72], [0.5, 0.72]] as const) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.16, 12), dark)
        wheel.rotation.z = Math.PI / 2
        wheel.position.set(x, 0.24, z)
        group.add(wheel)
      }
      group.add(body, cabin)
    }
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.08, 0.04),
      new THREE.MeshBasicMaterial({ color: '#3dba6a' })
    )
    bar.position.set(0, kind === 'bike' ? 1.15 : kind === 'ship' ? 1.85 : kind === 'plane' ? 1.7 : 1.4, 0)
    group.add(bar)
    group.userData.bar = bar
    this.scene.add(group)
    return group
  }

  makeTrap() {
    const group = new THREE.Group()
    const hole = new THREE.Mesh(
      new THREE.CylinderGeometry(1.05, 0.72, 0.42, 18),
      new THREE.MeshStandardMaterial({ color: 0x07070b, roughness: 1, emissive: 0x2a0810, emissiveIntensity: 0.45 })
    )
    hole.position.y = 0.02
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.02, 1.35, 20),
      new THREE.MeshBasicMaterial({ color: 0x1a1214, side: THREE.DoubleSide })
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.24
    group.add(hole, ring)
    this.scene.add(group)
    return group
  }

  syncTraps() {
    const seen = new Set<string>()
    for (const trap of arena.traps) {
      const id = `${Math.round(trap.x)}:${Math.round(trap.z)}`
      seen.add(id)
      let mesh = this.trapMeshes.get(id)
      if (!mesh) {
        mesh = this.makeTrap()
        this.trapMeshes.set(id, mesh)
      }
      mesh.position.set(trap.x, trap.y, trap.z)
      if (!this.inPit) mesh.visible = true
    }
    for (const [id, mesh] of this.trapMeshes) {
      if (!seen.has(id)) {
        this.scene.remove(mesh)
        this.trapMeshes.delete(id)
      }
    }
  }

  syncVehicles() {
    const seen = new Set<string>()
    const look = new THREE.Vector3()
    this.camera.getWorldDirection(look)
    look.y = 0
    if (look.lengthSq() < 0.0001) look.set(0, 0, 1)
    look.normalize()
    for (const ride of arena.vehicles) {
      seen.add(ride.id)
      let mesh = this.vehicleMeshes.get(ride.id)
      if (!mesh) {
        mesh = this.makeRide(ride.kind)
        this.vehicleMeshes.set(ride.id, mesh)
      }
      if (ride.driver === arena.id) {
        if (ride.kind === 'plane') {
          const aim = new THREE.Vector3()
          this.camera.getWorldDirection(aim)
          mesh.position.copy(this.camera.position).addScaledVector(aim, 0.55)
          mesh.position.y = this.camera.position.y - 1.15
          mesh.rotation.order = 'YXZ'
          mesh.rotation.y = Math.atan2(aim.x, aim.z)
          mesh.rotation.x = this.control.flying ? -aim.y * 0.9 : 0
          mesh.rotation.z = 0
          const prop = mesh.userData.prop as THREE.Object3D | undefined
          if (prop) prop.rotation.z += this.control.flying ? 1.15 : 0.18
        } else {
          const drop = ride.kind === 'ship' ? 1.7 : 1.5
          mesh.position.copy(this.camera.position).addScaledVector(look, ride.kind === 'ship' ? 1.1 : 0.2)
          mesh.position.y = this.camera.position.y - drop
          mesh.rotation.y = Math.atan2(look.x, look.z)
        }
      } else {
        mesh.position.set(ride.x, ride.y, ride.z)
        mesh.rotation.y = ride.yaw
      }
      const bar = mesh.userData.bar as THREE.Mesh
      const ratio = Math.max(0.04, ride.hp / (ride.maxHp || 1))
      bar.scale.x = ratio
      bar.position.x = (ratio - 1) * 0.45
      const mat = bar.material as THREE.MeshBasicMaterial
      mat.color.set(ratio < 0.35 ? '#e24b3a' : '#3dba6a')
    }
    for (const [id, mesh] of this.vehicleMeshes) {
      if (!seen.has(id)) {
        this.scene.remove(mesh)
        this.vehicleMeshes.delete(id)
      }
    }
    const label = document.querySelector('#ride')
    const mine = arena.vehicles.find(ride => ride.driver === arena.id)
    if (label) label.textContent = mine ? `${mine.name} ${Math.max(0, Math.round(mine.hp))}/${mine.maxHp}` : ''
  }

  takeWallet(money: number, item?: string, shop?: boolean) {
    arena.money = money
    this.showPurse()
    if (item === 'drum') {
      this.drumOn = true
      this.reload()
    }
    if (item === 'glass') this.glass = true
    if (item === 'grenade') this.grenades += 1
    if (item === 'vest') this.onVest?.()
    if (item === 'med') this.pushFeed('治疗了')
    if (shop && item) this.shop?.classList.remove('hidden')
    if (shop && !item) this.shop?.classList.remove('hidden')
    this.paint()
  }

  throwGrenade() {
    if (this.control.swimming || this.grenades <= 0 || this.down) return
    this.grenades -= 1
    const dir = new THREE.Vector3()
    this.camera.getWorldDirection(dir)
    const at = this.camera.position.clone().addScaledVector(dir, 8)
    arena.send({ type: 'grenade', x: at.x, y: at.y, z: at.z })
    const boom = new THREE.Mesh(
      new THREE.SphereGeometry(1.1, 10, 8),
      new THREE.MeshBasicMaterial({ color: '#ffb15a', transparent: true, opacity: 0.85 })
    )
    boom.position.copy(at)
    this.scene.add(boom)
    window.setTimeout(() => this.scene.remove(boom), 280)
    this.paint()
  }

  syncPickups() {
    const seen = new Set<string>()
    for (const item of arena.pickups) {
      seen.add(item.id)
      let mesh = this.pickupMeshes.get(item.id)
      if (!mesh) {
        const color = item.kind === 'coin' ? '#f2c14e' : item.kind === 'grenade' ? '#d24b3a' : item.kind === 'knife' ? '#f4f4f4' : '#e7a15c'
        mesh = item.kind === 'coin'
          ? new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.08, 14), new THREE.MeshBasicMaterial({ color }))
          : new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshBasicMaterial({ color }))
        if (item.kind === 'coin') mesh.rotation.x = Math.PI / 2
        this.scene.add(mesh)
        this.pickupMeshes.set(item.id, mesh)
      }
      mesh.position.set(item.x, item.y + 0.45, item.z)
      mesh.rotation.y += 0.03
      const dist = Math.hypot(this.camera.position.x - item.x, this.camera.position.z - item.z)
      if (dist < 2.2 && !this.claimed.has(item.id)) {
        this.claimed.add(item.id)
        arena.send({ type: 'pickup', id: item.id })
      }
    }
    for (const [id, mesh] of this.pickupMeshes) {
      if (!seen.has(id)) {
        this.scene.remove(mesh)
        this.pickupMeshes.delete(id)
        this.claimed.delete(id)
      }
    }
  }

  drawMap() {
    const ctx = this.mapCtx
    const canvas = this.mapCanvas
    const playing = !!document.querySelector('.menu')?.classList.contains('hidden')
    const radar = canvas?.parentElement
    if (radar) radar.hidden = !playing
    if (this.duelLabel) this.duelLabel.hidden = !playing
    if (!playing || !ctx || !canvas) return
    const w = canvas.width
    const h = canvas.height
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = 'rgba(12, 40, 18, 0.82)'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = '#d7f3c8'
    ctx.strokeRect(1, 1, w - 2, h - 2)
    const scale = 0.28
    const reach = 66
    const cx = w / 2
    const cy = h / 2
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(cx - 2, cy - 2, 5, 5)
    ctx.font = '11px "WenQuanYi Micro Hei", sans-serif'
    {
      const dx = (ladderAt.x - this.camera.position.x) * scale
      const dz = (ladderAt.z - this.camera.position.z) * scale
      if (Math.hypot(dx, dz) <= reach) {
        ctx.fillStyle = '#f0d24a'
        ctx.fillRect(cx + dx - 3, cy + dz - 3, 6, 6)
        ctx.fillStyle = '#fff8d0'
        ctx.fillText('梯', cx + dx + 4, cy + dz + 3)
      }
    }
    for (const cave of caveSites) {
      const dx = (cave.x - this.camera.position.x) * scale
      const dz = (cave.z - this.camera.position.z) * scale
      if (Math.hypot(dx, dz) > reach) continue
      ctx.fillStyle = '#9ecbff'
      ctx.fillRect(cx + dx - 3, cy + dz - 3, 6, 6)
      ctx.fillStyle = '#e7f3ff'
      ctx.fillText('洞', cx + dx + 4, cy + dz + 3)
    }
    for (const mark of landmarks) {
      const dx = (mark.x - this.camera.position.x) * scale
      const dz = (mark.z - this.camera.position.z) * scale
      if (Math.hypot(dx, dz) > reach) continue
      ctx.fillStyle = '#e7c56a'
      ctx.fillRect(cx + dx - 3, cy + dz - 3, 6, 6)
      ctx.fillStyle = '#fff8e8'
      ctx.fillText(mark.mark, cx + dx + 4, cy + dz + 3)
    }
    {
      const dx = (airport.x + airport.length / 2 - this.camera.position.x) * scale
      const dz = (airport.z - this.camera.position.z) * scale
      if (Math.hypot(dx, dz) <= reach) {
        ctx.fillStyle = '#d7e6f5'
        ctx.fillRect(cx + dx - 3, cy + dz - 3, 6, 6)
        ctx.fillStyle = '#fff'
        ctx.fillText('机', cx + dx + 4, cy + dz + 3)
      }
    }
    for (const ally of arena.bots) {
      if (ally.team !== 'ally' || !ally.alive) continue
      const dx = (ally.x - this.camera.position.x) * scale
      const dz = (ally.z - this.camera.position.z) * scale
      if (Math.hypot(dx, dz) > reach) continue
      ctx.fillStyle = '#7dff6a'
      ctx.fillRect(cx + dx - 2, cy + dz - 2, 4, 4)
    }
    for (const pet of arena.bots) {
      if (pet.team !== 'pet' || !pet.alive) continue
      const dx = (pet.x - this.camera.position.x) * scale
      const dz = (pet.z - this.camera.position.z) * scale
      if (Math.hypot(dx, dz) > reach) continue
      ctx.fillStyle = pet.lead ? '#ffd36a' : '#fff4d2'
      ctx.fillRect(cx + dx - 3, cy + dz - 3, 6, 6)
      ctx.fillStyle = '#fff'
      ctx.fillText('狐', cx + dx + 4, cy + dz + 3)
    }
    for (const ride of arena.vehicles) {
      const dx = (ride.x - this.camera.position.x) * scale
      const dz = (ride.z - this.camera.position.z) * scale
      if (Math.hypot(dx, dz) > reach) continue
      const mark = ride.kind === 'bike' ? '摩' : ride.kind === 'ship' ? '船' : ride.kind === 'plane' ? '机' : '车'
      ctx.fillStyle = ride.kind === 'bike' ? '#ff8a7a' : ride.kind === 'ship' ? '#7fd0c8' : ride.kind === 'plane' ? '#f0d24a' : '#8ec7ff'
      ctx.fillRect(cx + dx - 3, cy + dz - 3, 6, 6)
      ctx.fillStyle = '#fff'
      ctx.fillText(mark, cx + dx + 4, cy + dz + 3)
    }
    for (const fish of arena.bots) {
      if (fish.shape !== 'fish' || !fish.alive) continue
      const dx = (fish.x - this.camera.position.x) * scale
      const dz = (fish.z - this.camera.position.z) * scale
      if (Math.hypot(dx, dz) > reach) continue
      ctx.fillStyle = (fish.level || 1) > this.fishLevel ? '#ff6a5a' : '#7ee0ff'
      ctx.beginPath()
      ctx.arc(cx + dx, cy + dz, 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.fillText(String(fish.level || 1), cx + dx + 5, cy + dz + 3)
    }
    for (const coin of arena.pickups) {
      if (coin.kind !== 'coin') continue
      const dx = (coin.x - this.camera.position.x) * scale
      const dz = (coin.z - this.camera.position.z) * scale
      if (Math.hypot(dx, dz) > reach) continue
      ctx.fillStyle = '#f2c14e'
      ctx.beginPath()
      ctx.arc(cx + dx, cy + dz, 3.5, 0, Math.PI * 2)
      ctx.fill()
    }
    if (!this.inPit) {
      for (const trap of arena.traps) {
        const dx = (trap.x - this.camera.position.x) * scale
        const dz = (trap.z - this.camera.position.z) * scale
        if (Math.hypot(dx, dz) > reach) continue
        ctx.fillStyle = '#141418'
        ctx.beginPath()
        ctx.arc(cx + dx, cy + dz, 4, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    const guide = document.querySelector('#guide')
    const leader = arena.bots.find(bot => bot.team === 'pet' && bot.lead && bot.alive)
    if (guide) guide.textContent = leader ? `跟着${leader.name}，它去隐藏的泉水` : ''
    if (this.sidesLabel) this.sidesLabel.textContent = `我方 ${arena.ally}  敌方 ${arena.enemy}`
    const foes = arena.bots.filter(
      bot => bot.alive && (bot.team === 'enemy' || bot.team === 'mimic' || bot.team === 'beast' || bot.shape === 'fish')
    )
    let nearest: FighterState | null = null
    let best = 48
    for (const foe of foes) {
      const dist = Math.hypot(foe.x - this.camera.position.x, foe.z - this.camera.position.z)
      if (dist < best) {
        best = dist
        nearest = foe
      }
    }
    if (this.duelLabel) {
      const mine = this.control.swimming ? `鱼Lv.${this.fishLevel}` : `你 ${Math.round(this.hp)}`
      const foe = nearest?.shape === 'fish' && nearest.level ? `${nearest.name} Lv.${nearest.level}` : nearest?.name
      this.duelLabel.textContent = nearest
        ? `${mine}   ${foe} ${Math.max(0, Math.round(nearest.hp))}`
        : mine
    }
  }

  update() {
    const dt = 1 / 60
    this.cool = Math.max(0, this.cool - dt)
    this.flash.intensity = Math.max(0, this.flash.intensity - dt * 28)
    this.viewmodel.position.z += (-0.55 - this.viewmodel.position.z) * 0.2
    if (this.control.firing && this.gun().auto) this.tryFire(true)
    this.viewmodel.visible = !this.control.hold && !this.control.flying && !this.control.swimming
    this.syncPickups()
    this.syncVehicles()
    this.syncTraps()
    this.drawMap()
    if (this.inPit) this.holdPit()
    const playing = !!document.querySelector('.menu')?.classList.contains('hidden')
    const goalFov = this.scoped && playing ? this.gun().scopeFov : this.hipFov
    if (Math.abs(this.camera.fov - goalFov) > 0.15) {
      this.camera.fov += (goalFov - this.camera.fov) * 0.18
      this.camera.updateProjectionMatrix()
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tracer = this.tracers[i]
      tracer.life -= dt
      const progress = 1 - tracer.life / tracer.max
      tracer.mesh.position.copy(tracer.from).lerp(tracer.to, Math.min(1, 0.08 + progress * 0.92))
      if (tracer.life <= 0) {
        this.scene.remove(tracer.mesh)
        this.tracers.splice(i, 1)
      }
    }
    if (this.down) {
      this.downT -= dt
      if (this.downT <= 0) {
        this.down = false
        const y = 42
        this.camera.position.set(8 + Math.random() * 6, y, 8 + Math.random() * 6)
        arena.send({ type: 'alive' })
      }
    }
    const look = new THREE.Vector3()
    this.camera.getWorldDirection(look)
    arena.send({
      type: 'pose',
      x: this.camera.position.x,
      y: this.control.swimming ? 25.3 : this.camera.position.y,
      z: this.camera.position.z,
      yaw: Math.atan2(look.x, look.z),
      dx: look.x,
      dy: look.y,
      dz: look.z,
      flying: this.control.flying && this.control.ride === 'plane'
    })
    const nearTrap = !this.inPit && !this.control.ride && !this.control.hold && arena.traps.some(trap => {
      return Math.hypot(trap.x - this.camera.position.x, trap.z - this.camera.position.z) < 3.4
    })
    if (nearTrap && !this.trapHint) {
      this.trapHint = true
      this.pushFeed('站在黑洞上按「跳」掉进去')
    }
    if (!nearTrap) this.trapHint = false
    if (this.jumpIntoTrap) {
      this.jumpIntoTrap = false
      if (nearTrap) arena.send({ type: 'enterpit' })
    }
    this.paintRideHint()
    this.hud.classList.toggle('hidden', !playing)
    if (!playing && this.scoped) {
      this.scoped = false
      this.control.lookScale = 1
      const lock = this.control.control as { lookScale?: number }
      lock.lookScale = 1
      this.paintScope()
    }
    this.paint()
  }
}
