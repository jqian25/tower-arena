import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import Control from '../control'
import { arena } from '../arena/net'
import { landmarks } from '../../landmarks.js'
import { landmarkModels, seatLandmarks } from './props'

const loader = new GLTFLoader()

type Fit = 'tall' | 'wide'

type Piece = {
  file: string
  x: number
  z: number
  rot: number
  size: number
  fit: Fit
}

type Shell = { wall: string; floor: string; ceil: string }

const HOUSES = ['tower', 'harbor', 'ruins', 'grove', 'snow']

const shells: Record<string, Shell> = {
  tower: { wall: '#c4b49a', floor: '#8d6a45', ceil: '#efe6d6' },
  harbor: { wall: '#d9d3c6', floor: '#6d5644', ceil: '#f4efe6' },
  ruins: { wall: '#b7b1a8', floor: '#5c564e', ceil: '#d9d3c8' },
  grove: { wall: '#e6d7c3', floor: '#a56b45', ceil: '#f7f1e6' },
  snow: { wall: '#e7eef2', floor: '#8a7560', ceil: '#f7fbff' }
}

const layouts: Record<string, Piece[]> = {
  tower: [
    { file: 'table_small', x: 0.2, z: -1.1, rot: 0.2, size: 0.62, fit: 'tall' },
    { file: 'chair_stool', x: 0.15, z: 0.35, rot: Math.PI, size: 0.58, fit: 'tall' },
    { file: 'book_set', x: 0.45, z: -1.15, rot: 0.4, size: 0.22, fit: 'tall' },
    { file: 'lamp_standing', x: 2.7, z: -2.2, rot: 0, size: 1.55, fit: 'tall' },
    { file: 'cabinet_medium_decorated', x: -3.1, z: -2.3, rot: 0.15, size: 1.35, fit: 'tall' }
  ],
  harbor: [
    { file: 'table_medium', x: 0, z: -1.15, rot: 0, size: 0.78, fit: 'tall' },
    { file: 'chair_A', x: -1.35, z: -1.15, rot: Math.PI / 2, size: 0.95, fit: 'tall' },
    { file: 'chair_B', x: 1.35, z: -1.15, rot: -Math.PI / 2, size: 0.95, fit: 'tall' },
    { file: 'shelf_B_large_decorated', x: 0, z: -3.15, rot: 0, size: 1.9, fit: 'tall' },
    { file: 'book_set', x: -0.35, z: -1.15, rot: 0.3, size: 0.2, fit: 'tall' },
    { file: 'lamp_table', x: 2.6, z: -2.4, rot: 0, size: 0.48, fit: 'tall' },
    { file: 'rug_rectangle_A', x: 0, z: -0.9, rot: 0, size: 3.1, fit: 'wide' }
  ],
  ruins: [
    { file: 'chair_A', x: -1.7, z: -0.2, rot: Math.PI, size: 0.95, fit: 'tall' },
    { file: 'chair_B', x: 1.7, z: -0.2, rot: Math.PI, size: 0.95, fit: 'tall' },
    { file: 'shelf_B_large_decorated', x: 0, z: -3.15, rot: 0, size: 1.85, fit: 'tall' },
    { file: 'lamp_standing', x: -3.1, z: -2.5, rot: 0, size: 1.5, fit: 'tall' },
    { file: 'pictureframe_large_A', x: 4.35, z: -1.2, rot: -Math.PI / 2, size: 1.2, fit: 'tall' },
    { file: 'rug_oval_A', x: 0, z: -1.4, rot: 0, size: 2.4, fit: 'wide' }
  ],
  grove: [
    { file: 'bed_double_A', x: -1.7, z: -1.7, rot: Math.PI / 2, size: 1.15, fit: 'tall' },
    { file: 'rug_rectangle_A', x: 0.4, z: -0.4, rot: 0, size: 3.3, fit: 'wide' },
    { file: 'cabinet_medium_decorated', x: 3.15, z: -2.4, rot: Math.PI, size: 1.4, fit: 'tall' },
    { file: 'lamp_standing', x: 2.3, z: -0.6, rot: 0, size: 1.55, fit: 'tall' },
    { file: 'armchair', x: 2.2, z: 0.7, rot: -Math.PI / 2, size: 0.95, fit: 'tall' },
    { file: 'pictureframe_large_A', x: -4.35, z: -1.3, rot: Math.PI / 2, size: 1.15, fit: 'tall' }
  ],
  snow: [
    { file: 'couch', x: -0.2, z: -2.15, rot: 0, size: 0.95, fit: 'tall' },
    { file: 'armchair', x: 2.35, z: -0.15, rot: Math.PI, size: 0.95, fit: 'tall' },
    { file: 'rug_oval_A', x: 0.3, z: -0.8, rot: 0.2, size: 2.6, fit: 'wide' },
    { file: 'cactus_medium_A', x: -3.2, z: -2.5, rot: 0.4, size: 0.95, fit: 'tall' },
    { file: 'lamp_standing', x: -2.3, z: -0.4, rot: 0, size: 1.5, fit: 'tall' },
    { file: 'table_small', x: 0.6, z: -0.55, rot: 0, size: 0.5, fit: 'tall' }
  ]
}

const HALF_X = 4.6
const HALF_Z = 3.7

function filesInUse() {
  const names = new Set<string>()
  for (const id of HOUSES) for (const piece of layouts[id]) names.add(piece.file)
  return [...names]
}

function setShown(group: THREE.Group, shown: boolean) {
  group.visible = shown
  group.traverse(obj => {
    const light = obj as THREE.Light
    if (light.isLight) light.visible = shown
  })
}

function buildShell(group: THREE.Group, paint: Shell) {
  const wall = new THREE.MeshStandardMaterial({ color: paint.wall, roughness: 0.92 })
  const floorMat = new THREE.MeshStandardMaterial({ color: paint.floor, roughness: 0.84 })
  const ceilMat = new THREE.MeshStandardMaterial({ color: paint.ceil, roughness: 0.95 })
  const wood = new THREE.MeshStandardMaterial({ color: '#7a5233', roughness: 0.78 })
  const floor = new THREE.Mesh(new THREE.BoxGeometry(HALF_X * 2 + 0.5, 0.18, HALF_Z * 2 + 0.5), floorMat)
  floor.position.y = -0.09
  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(HALF_X * 2 + 0.5, 0.16, HALF_Z * 2 + 0.5), ceilMat)
  ceiling.position.y = 3.25
  const west = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.2, HALF_Z * 2 + 0.4), wall)
  west.position.set(-HALF_X - 0.05, 1.6, 0)
  const east = west.clone()
  east.position.x = HALF_X + 0.05
  const north = new THREE.Mesh(new THREE.BoxGeometry(HALF_X * 2 + 0.7, 3.2, 0.22), wall)
  north.position.set(0, 1.6, -HALF_Z - 0.05)
  const southWidth = HALF_X - 0.95
  const southLeft = new THREE.Mesh(new THREE.BoxGeometry(southWidth, 3.2, 0.22), wall)
  southLeft.position.set(-(0.95 + southWidth / 2), 1.6, HALF_Z + 0.05)
  const southRight = southLeft.clone()
  southRight.position.x = 0.95 + southWidth / 2
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.85, 0.22), wall)
  lintel.position.set(0, 2.78, HALF_Z + 0.05)
  for (const x of [-0.95, 0.95]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.35, 0.16), wood)
    post.position.set(x, 1.15, HALF_Z + 0.12)
    group.add(post)
  }
  const light = new THREE.PointLight('#ffd2a2', 1.45, 14, 2)
  light.position.set(0, 2.45, -0.3)
  group.add(floor, ceiling, west, east, north, southLeft, southRight, lintel, light)
}

function placePiece(template: THREE.Object3D, piece: Piece) {
  const model = template.clone(true)
  model.position.set(0, 0, 0)
  model.rotation.set(0, 0, 0)
  model.scale.set(1, 1, 1)
  model.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(model)
  const size = box.getSize(new THREE.Vector3())
  const basis = piece.fit === 'tall' ? size.y : Math.max(size.x, size.z)
  const fit = piece.size / Math.max(basis, 0.001)
  model.scale.setScalar(fit)
  model.rotation.y = piece.rot
  model.updateMatrixWorld(true)
  const fitted = new THREE.Box3().setFromObject(model)
  model.position.set(piece.x, -fitted.min.y, piece.z)
  return model
}

export function createHouses(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  control: Control,
  ground: (x: number, z: number) => number,
  note: (text: string) => void,
  blocked: () => boolean,
  fainted: () => boolean
) {
  const button = document.querySelector<HTMLButtonElement>('#enter-house')
  const rooms = new Map<string, THREE.Group>()
  let current: string | null = null
  let seated = false
  const templates = new Map<string, THREE.Object3D>()

  for (const id of HOUSES) {
    const mark = landmarks.find(item => item.id === id)
    const paint = shells[id]
    if (!mark || !paint) continue
    const group = new THREE.Group()
    buildShell(group, paint)
    setShown(group, false)
    group.position.set(mark.x, ground(mark.x, mark.z) + 0.35, mark.z)
    scene.add(group)
    rooms.set(id, group)
  }

  const pending = filesInUse()
  let left = pending.length
  const furnish = () => {
    for (const id of HOUSES) {
      const group = rooms.get(id)
      const pieces = layouts[id]
      if (!group || !pieces) continue
      for (const piece of pieces) {
        const template = templates.get(piece.file)
        if (!template) continue
        group.add(placePiece(template, piece))
      }
    }
  }
  for (const file of pending) {
    loader.load(
      `furniture/${file}.gltf`,
      gltf => {
        templates.set(file, gltf.scene)
        left -= 1
        if (left === 0) furnish()
      },
      undefined,
      () => {
        left -= 1
        if (left === 0) furnish()
      }
    )
  }

  const nearest = () => {
    let best: (typeof landmarks)[number] | null = null
    let dist = 9
    for (const mark of landmarks) {
      if (!rooms.has(mark.id)) continue
      const gap = Math.hypot(camera.position.x - mark.x, camera.position.z - mark.z)
      if (gap < dist) {
        dist = gap
        best = mark
      }
    }
    return best
  }

  const leave = (quiet = false) => {
    if (!current) return
    const id = current
    const mark = landmarks.find(item => item.id === id)
    current = null
    control.room = null
    control.onLeaveRoom = null
    const group = rooms.get(id)
    if (group) setShown(group, false)
    for (const child of scene.children) {
      if (!child.userData.houseHidden) continue
      child.visible = true
      child.userData.houseHidden = false
    }
    const shell = landmarkModels.get(id)
    if (shell) shell.visible = true
    if (mark) {
      const z = mark.z + HALF_Z + 2.6
      camera.position.set(mark.x, ground(mark.x, z) + 2.15, z)
      control.velocity.set(0, 0, 0)
    }
    if (button) {
      button.hidden = true
      button.textContent = '进屋'
    }
    arena.send({ type: 'indoors', on: false })
    if (!quiet) note('走出屋子了')
  }

  const enter = (id: string) => {
    if (current === id) return
    if (!current && control.ride) {
      note('先下车再进屋')
      return
    }
    if (!current && control.hold) {
      note('先离开梯子再进屋')
      return
    }
    if (!current && blocked()) return
    const mark = landmarks.find(item => item.id === id)
    const group = rooms.get(id)
    if (!mark || !group) return
    const floor = ground(mark.x, mark.z) + 0.35
    group.position.set(mark.x, floor, mark.z)
    setShown(group, true)
    const shell = landmarkModels.get(id)
    if (shell) shell.visible = false
    current = id
    control.room = {
      x: mark.x,
      z: mark.z,
      y: floor + 1.62,
      halfX: HALF_X - 0.28,
      halfZ: HALF_Z,
      door: 0.92
    }
    control.onLeaveRoom = () => leave()
    camera.position.set(mark.x, floor + 1.62, mark.z + 2.35)
    camera.lookAt(mark.x, floor + 1.35, mark.z - 1)
    control.velocity.set(0, 0, 0)
    if (button) {
      button.hidden = false
      button.textContent = '出门'
    }
    arena.send({ type: 'indoors', on: true })
    note(`走进${mark.name}。走到南边门口，或再按「出门」。`)
  }

  const press = () => {
    if (document.querySelector('.menu') && !document.querySelector('.menu')?.classList.contains('hidden')) return
    if (current) {
      leave()
      return
    }
    const mark = nearest()
    if (!mark) {
      note('靠近塔、港、墟、林或雪再进屋')
      return
    }
    enter(mark.id)
  }

  button?.addEventListener('click', () => press())
  window.addEventListener('keydown', event => {
    if ((event.key === 'h' || event.key === 'H') && !event.repeat) press()
  })

  return {
    update() {
      if (current && fainted()) leave(true)
      if (current) {
        const room = rooms.get(current)
        for (const child of scene.children) {
          if (child === room) continue
          const light = child as THREE.Light
          if (light.isLight || !child.visible) continue
          child.userData.houseHidden = true
          child.visible = false
        }
      }
      const playing = !!document.querySelector('.menu')?.classList.contains('hidden')
      if (playing && !seated) {
        seatLandmarks(ground)
        for (const [id, group] of rooms) {
          const mark = landmarks.find(item => item.id === id)
          if (!mark) continue
          group.position.set(mark.x, ground(mark.x, mark.z) + 0.35, mark.z)
        }
        seated = true
      }
      if (!button) return
      if (!playing) {
        button.hidden = true
        return
      }
      if (current) {
        button.hidden = false
        button.textContent = '出门'
        return
      }
      const mark = nearest()
      button.hidden = !mark
      button.textContent = '进屋'
    },
    isInside: () => current !== null,
    press,
    enter
  }
}
