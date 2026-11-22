import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import Control from '../control'
import { skins } from '../../skins.js'

export const ladderAt = { x: 14, z: 20 }
const VIEW = 16
const RUNG = 0.55

const loader = new GLTFLoader()
const tangent = new THREE.Vector3()
const ahead = new THREE.Vector3()
const behind = new THREE.Vector3()
const bankUp = new THREE.Vector3()
const radial = new THREE.Vector3()
const backSample = new THREE.Vector3()
const world = new THREE.Vector3()
const lookTarget = new THREE.Vector3()

export function createSlide(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  control: Control,
  ground: (x: number, z: number) => number
) {
  const root = new THREE.Group()
  scene.add(root)

  const wood = new THREE.MeshStandardMaterial({ color: '#c49255', roughness: 0.8 })
  const railMat = new THREE.MeshStandardMaterial({ color: '#8a5a32', roughness: 0.75 })
  const chuteMat = new THREE.MeshStandardMaterial({
    color: '#f0d24a',
    roughness: 0.42,
    metalness: 0.12,
    emissive: '#6a4a10',
    emissiveIntensity: 0.18
  })
  const ladder = new THREE.Group()
  root.add(ladder)
  const poles = [-0.46, 0.46].map(x => {
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.12, VIEW, 0.12), railMat)
    pole.position.x = x
    ladder.add(pole)
    return pole
  })
  const rungs: THREE.Mesh[] = []
  const rungCount = Math.ceil(VIEW / RUNG) + 1
  for (let i = 0; i < rungCount; i++) {
    const rung = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.08, 0.1), wood)
    ladder.add(rung)
    rungs.push(rung)
  }
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.4, 0.08),
    new THREE.MeshStandardMaterial({ color: '#2f6b28' })
  )
  sign.position.set(0, 1.2, 0.4)
  root.add(sign)

  const track = new THREE.Group()
  track.visible = false
  root.add(track)
  const pieces: THREE.Group[] = []
  for (let i = 0; i < 14; i++) {
    const piece = new THREE.Group()
    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.08, 1.35), chuteMat)
    piece.add(deck)
    for (const x of [-0.48, 0.48]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 1.35), railMat)
      rail.position.set(x, 0.14, 0)
      piece.add(rail)
    }
    track.add(piece)
    pieces.push(piece)
  }

  const rider = new THREE.Group()
  root.add(rider)
  rider.visible = false

  let mixer: THREE.AnimationMixer | null = null
  let clips = new Map<string, THREE.AnimationClip>()
  let action: THREE.AnimationAction | null = null
  let clipName = ''
  let model: THREE.Object3D | null = null
  let skinId = ''
  let loading = ''

  let mode: 'off' | 'climb' | 'jump' | 'slide' = 'off'
  let along = 0.8
  let jumpT = 0
  let climbHeld = false
  let rideHeight = 4
  let rideTurns = 1.4
  let rideT = 0

  const stateLabel = () => {
    const node = document.querySelector('#slide-state')
    if (!node) return
    const text =
      mode === 'climb'
        ? `高度 ${Math.round(along)}，按住继续爬，按「跳」坐过山车`
        : mode === 'jump'
          ? '起跳'
          : mode === 'slide'
            ? '过山车'
            : ''
    node.textContent = text
  }

  function place() {
    const y = ground(ladderAt.x, ladderAt.z)
    root.position.set(ladderAt.x, y + 0.5, ladderAt.z)
  }

  function layoutLadder(focus: number) {
    const base = Math.max(0, focus - VIEW * 0.45)
    for (const pole of poles) pole.position.y = base + VIEW / 2
    rungs.forEach((rung, index) => {
      const y = base + 0.35 + index * RUNG
      rung.position.set(0, y, 0)
      rung.visible = y > 0.2 && y < base + VIEW
    })
  }

  function sample(t: number, out: THREE.Vector3) {
    const clamped = Math.min(1, Math.max(0, t))
    const theta = clamped * rideTurns * Math.PI * 2
    const flare = 2.2 + Math.min(5.5, rideHeight / 20)
    const radius = 1.55 + Math.sin(clamped * Math.PI) * flare
    const drop = Math.max(0.4, rideHeight - 1.2)
    const wave = Math.sin(theta) * Math.min(3.4, drop * 0.08)
    const y = 1.2 + drop * (1 - clamped) + wave * (1 - clamped * 0.35)
    out.set(Math.cos(theta) * radius, Math.max(1.15, y), Math.sin(theta) * radius)
    return theta
  }

  function frameAt(t: number, pos: THREE.Vector3) {
    const theta = sample(t, pos)
    sample(Math.min(1, t + 0.025), ahead)
    sample(Math.max(0, t - 0.025), backSample)
    tangent.copy(ahead).sub(backSample)
    if (tangent.lengthSq() < 1e-6) tangent.set(0, -1, 0.2)
    tangent.normalize()
    radial.set(-Math.cos(theta), 0, -Math.sin(theta))
    bankUp.set(0, 1, 0).addScaledVector(radial, 0.95).normalize()
  }

  function play(name: string) {
    if (!mixer || clipName === name) return
    const clip = clips.get(name)
    if (!clip) return
    const next = mixer.clipAction(clip)
    next.reset().fadeIn(0.12).play()
    if (action) action.fadeOut(0.12)
    action = next
    clipName = name
  }

  function equip(id: string) {
    const skin = skins.find(item => item.id === id) || skins[0]
    if (skin.id === skinId || loading === skin.id) return
    loading = skin.id
    loader.load(`characters/${skin.file}`, gltf => {
      if (loading !== skin.id) return
      if (model) rider.remove(model)
      model = gltf.scene
      model.traverse(obj => {
        if (/sword|shield|staff|bow|axe|wand|crossbow|arrow/i.test(obj.name)) obj.visible = false
      })
      const box = new THREE.Box3().setFromObject(model)
      const size = box.getSize(new THREE.Vector3())
      const height = Math.max(0.001, size.y)
      const fit = 1.65 / height
      model.scale.setScalar(fit)
      model.position.y = -box.min.y * fit
      rider.add(model)
      mixer = new THREE.AnimationMixer(model)
      clips = new Map(gltf.animations.map(clip => [clip.name, clip]))
      action = null
      clipName = ''
      skinId = skin.id
      if (mode === 'climb') play('Idle')
      if (mode === 'slide') play('Sit_Floor_Idle')
    })
  }

  function levelCamera() {
    camera.up.set(0, 1, 0)
  }

  function enter() {
    if (mode !== 'off') return false
    if (control.ride) {
      const node = document.querySelector('#slide-state')
      if (node) node.textContent = '先下车再爬梯'
      return false
    }
    place()
    mode = 'climb'
    along = 0.7
    control.hold = true
    control.isJumping = false
    control.velocity.set(0, 0, 0)
    rider.visible = true
    track.visible = false
    ladder.visible = true
    levelCamera()
    play('Idle')
    stateLabel()
    return true
  }

  function beginRide() {
    rideHeight = Math.max(along, 3.5)
    rideTurns = 1.35 + Math.min(2.8, rideHeight / 24)
    rideT = 0
    mode = 'slide'
    ladder.visible = false
    track.visible = true
    play('Sit_Floor_Idle')
    stateLabel()
  }

  function leave() {
    frameAt(1, behind)
    const landX = root.position.x + behind.x
    const landZ = root.position.z + behind.z
    const floor = ground(landX, landZ)
    control.hold = false
    control.isJumping = false
    control.velocity.set(0, 0, 0)
    rider.visible = false
    track.visible = false
    ladder.visible = true
    levelCamera()
    camera.position.set(landX, floor + 2.2, landZ)
    camera.lookAt(landX + tangent.x * 6, floor + 1.6, landZ + tangent.z * 6)
    mode = 'off'
    stateLabel()
  }

  function setHeld(held: boolean) {
    climbHeld = held
    if (held && mode === 'off') enter()
  }

  function press() {
    if (mode === 'off') {
      enter()
      return
    }
    if (mode === 'climb') {
      mode = 'jump'
      jumpT = 0.34
      control.isJumping = false
      control.velocity.y = 0
      play('Jump_Start')
      stateLabel()
    }
  }

  function followClimb() {
    rider.position.set(0, along, 0.38)
    rider.rotation.set(0.15, 0, 0)
    rider.up.set(0, 1, 0)
    rider.getWorldPosition(world)
    levelCamera()
    camera.position.set(world.x, world.y + 1.15, world.z + 3.1)
    camera.lookAt(world.x, world.y + 0.55, world.z)
  }

  function followRide(dt: number) {
    const seconds = 6.2 + Math.min(16, rideHeight / 7)
    rideT = Math.min(1, rideT + dt / seconds)
    frameAt(rideT, behind)
    rider.position.copy(behind)
    rider.up.copy(bankUp)
    world.copy(behind).add(root.position)
    rider.lookAt(world.clone().sub(tangent))
    pieces.forEach((piece, index) => {
      const u = Math.min(1, Math.max(0, rideT + (index - 4) * 0.028))
      frameAt(u, ahead)
      piece.position.copy(ahead)
      piece.up.copy(bankUp)
      piece.lookAt(ahead.clone().add(root.position).add(tangent))
    })
    frameAt(rideT, behind)
    world.copy(behind).add(root.position)
    camera.up.copy(bankUp)
    camera.position.copy(world).addScaledVector(tangent, -3.8).addScaledVector(bankUp, 1.55)
    lookTarget.copy(world).addScaledVector(tangent, 8)
    camera.lookAt(lookTarget)
    if (rideT >= 1) leave()
  }

  function update(dt: number) {
    if (mode === 'off') {
      place()
      layoutLadder(4)
    }
    if (mode === 'climb') {
      const up = climbHeld || control.downKeys.w || control.velocity.x > 0.35
      const down = control.downKeys.s || control.velocity.x < -0.35
      if (up) along += 4.4 * dt
      if (down) along -= 4.4 * dt
      along = Math.max(0.45, along)
      if (up || down) play('Walking_A')
      else play('Idle')
      layoutLadder(along)
      if (control.isJumping || control.velocity.y > 1) {
        control.isJumping = false
        control.velocity.y = 0
        mode = 'jump'
        jumpT = 0.34
        play('Jump_Start')
      }
      followClimb()
    } else if (mode === 'jump') {
      jumpT -= dt
      layoutLadder(along)
      play('Jump_Idle')
      followClimb()
      if (jumpT <= 0) beginRide()
    } else if (mode === 'slide') {
      play('Sit_Floor_Idle')
      followRide(dt)
    }
    if (mixer) mixer.update(dt)
    if (mode === 'climb' || mode === 'jump' || mode === 'slide') stateLabel()
  }

  equip('knight')
  place()
  layoutLadder(4)
  return { update, press, equip, enter, setHeld }
}
