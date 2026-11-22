import * as THREE from 'three'
import { BlockType } from '../terrain'

export default class Audio {
  constructor(_camera: THREE.PerspectiveCamera) {}

  disabled = false

  playSound(_type: BlockType) {}
}
