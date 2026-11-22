import * as THREE from 'three'
import { airport } from '../../airport.js'

export function createAirport(scene: THREE.Scene, ground: (x: number, z: number) => number) {
  const group = new THREE.Group()
  const asphalt = new THREE.MeshStandardMaterial({ color: '#2a2e33', roughness: 0.92 })
  const paint = new THREE.MeshBasicMaterial({ color: '#f4f1ea' })
  const yellow = new THREE.MeshBasicMaterial({ color: '#f0d24a' })
  const concrete = new THREE.MeshStandardMaterial({ color: '#c5c8cc', roughness: 0.86 })
  const glass = new THREE.MeshStandardMaterial({ color: '#9fd4f2', roughness: 0.2, transparent: true, opacity: 0.72 })
  const red = new THREE.MeshStandardMaterial({ color: '#c4473a', roughness: 0.6 })

  const runway = new THREE.Mesh(new THREE.BoxGeometry(airport.length, 0.35, airport.width), asphalt)
  runway.position.set(airport.length / 2, 0.18, 0)
  group.add(runway)

  for (let i = 0; i < 8; i++) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.04, 0.45), paint)
    dash.position.set(8 + i * 9, 0.38, 0)
    group.add(dash)
  }
  for (const end of [2.2, airport.length - 2.2]) {
    for (let i = -3; i <= 3; i++) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.04, 1.5), paint)
      stripe.position.set(end, 0.38, i * 1.8)
      group.add(stripe)
    }
  }
  const tower = new THREE.Mesh(new THREE.BoxGeometry(2.2, 7.5, 2.2), concrete)
  tower.position.set(-6, 3.8, airport.width / 2 + 4)
  const cab = new THREE.Mesh(new THREE.BoxGeometry(3.1, 1.3, 3.1), glass)
  cab.position.set(-6, 8.1, airport.width / 2 + 4)
  const hangar = new THREE.Mesh(new THREE.BoxGeometry(12, 4.2, 8), concrete)
  hangar.position.set(14, 2.2, -airport.width / 2 - 6)
  const roof = new THREE.Mesh(new THREE.BoxGeometry(12.6, 0.4, 8.6), red)
  roof.position.set(14, 4.4, -airport.width / 2 - 6)
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), yellow)
  beacon.position.set(-6, 9, airport.width / 2 + 4)
  group.add(tower, cab, hangar, roof, beacon)

  group.position.set(airport.x, ground(airport.x, airport.z), airport.z)
  scene.add(group)

  let seated = false
  return {
    update() {
      const playing = !!document.querySelector('.menu')?.classList.contains('hidden')
      if (!playing || seated) return
      group.position.y = ground(airport.x + airport.length / 2, airport.z)
      seated = true
    }
  }
}
