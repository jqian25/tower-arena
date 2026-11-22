import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { landmarks } from '../../landmarks.js'

const loader = new GLTFLoader()

const files: Record<string, string> = {
  tower: 'building_tower_A_blue.gltf',
  harbor: 'building_watermill_blue.gltf',
  ruins: 'building_church_blue.gltf',
  desert: 'building_well_blue.gltf',
  grove: 'building_home_A_blue.gltf',
  snow: 'building_windmill_blue.gltf'
}

export const landmarkModels = new Map<string, THREE.Object3D>()

export function loadLandmarkProps(scene: THREE.Scene, ground: (x: number, z: number) => number) {
  for (const mark of landmarks) {
    const file = files[mark.id]
    if (!file) continue
    loader.load(`props/${file}`, gltf => {
      const model = gltf.scene
      const box = new THREE.Box3().setFromObject(model)
      const size = box.getSize(new THREE.Vector3())
      const span = Math.max(size.x, size.y, size.z, 0.001)
      const fit = 9 / span
      model.scale.setScalar(fit)
      const offset = 0.5 - box.min.y * fit
      model.userData.groundOffset = offset
      model.position.set(mark.x, ground(mark.x, mark.z) + offset, mark.z)
      landmarkModels.set(mark.id, model)
      scene.add(model)
    })
  }
}

export function seatLandmarks(ground: (x: number, z: number) => number) {
  for (const [id, model] of landmarkModels) {
    const mark = landmarks.find(item => item.id === id)
    const offset = model.userData.groundOffset
    if (!mark || typeof offset !== 'number') continue
    model.position.y = ground(mark.x, mark.z) + offset
  }
}
