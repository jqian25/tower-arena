import * as THREE from 'three'
import { Sky } from '../sky/Sky.js'

const VIEWPORT_LOCK =
  'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover'

let viewportLocked = false
let healAt = 0

function stopGesture(event: Event) {
  event.preventDefault()
}

function installViewportLock() {
  if (viewportLocked) return
  viewportLocked = true
  const scrollable = '.menu, .features, .settings, .shop'
  document.addEventListener('gesturestart', stopGesture, { passive: false })
  document.addEventListener('gesturechange', stopGesture, { passive: false })
  document.addEventListener('gestureend', stopGesture, { passive: false })
  document.addEventListener(
    'touchstart',
    event => {
      if (event.touches.length > 1) event.preventDefault()
    },
    { passive: false, capture: true }
  )
  document.addEventListener(
    'touchmove',
    event => {
      const target = event.target
      if (target instanceof Element && target.closest(scrollable)) return
      event.preventDefault()
    },
    { passive: false, capture: true }
  )
  document.addEventListener(
    'wheel',
    event => {
      if (event.ctrlKey) event.preventDefault()
    },
    { passive: false }
  )
  window.addEventListener(
    'scroll',
    () => {
      if (window.scrollX || window.scrollY) window.scrollTo(0, 0)
    },
    { passive: true }
  )
}

function healViewport() {
  const vv = window.visualViewport
  if (!vv) return
  const drifted = Math.abs(vv.scale - 1) > 0.02 || Math.abs(vv.offsetLeft) > 1 || Math.abs(vv.offsetTop) > 1
  if (!drifted) return
  const now = performance.now()
  if (now - healAt < 400) return
  healAt = now
  const meta = document.querySelector('meta[name="viewport"]')
  if (meta) {
    meta.setAttribute('content', 'width=device-width, initial-scale=1')
    meta.setAttribute('content', VIEWPORT_LOCK)
  }
  if (window.scrollX || window.scrollY) window.scrollTo(0, 0)
}

function pinGameCanvas(canvas: HTMLCanvasElement) {
  const vv = window.visualViewport
  const width = Math.max(1, Math.round((vv && vv.width) || window.innerWidth || 1))
  const height = Math.max(1, Math.round((vv && vv.height) || window.innerHeight || 1))
  canvas.style.setProperty('position', 'fixed', 'important')
  canvas.style.setProperty('left', '0px', 'important')
  canvas.style.setProperty('top', '0px', 'important')
  canvas.style.setProperty('right', 'auto', 'important')
  canvas.style.setProperty('bottom', 'auto', 'important')
  canvas.style.setProperty('width', `${width}px`, 'important')
  canvas.style.setProperty('height', `${height}px`, 'important')
  canvas.style.setProperty('margin', '0', 'important')
  canvas.style.setProperty('transform', 'none', 'important')
  const root = document.documentElement
  root.style.setProperty('--vv-w', `${width}px`)
  root.style.setProperty('--vv-h', `${height}px`)
  return { width, height }
}

export default class Core {
  constructor() {
    this.camera = new THREE.PerspectiveCamera()
    this.renderer = new THREE.WebGLRenderer()
    this.scene = new THREE.Scene()
    this.initScene()
    this.initRenderer()
    this.initCamera()
  }

  viewW = 0
  viewH = 0
  camera: THREE.PerspectiveCamera
  scene: THREE.Scene
  renderer: THREE.WebGLRenderer
  water: THREE.ShaderMaterial | null = null
  clouds: THREE.Sprite[] = []

  fit = () => {
    const canvas = this.renderer.domElement
    const box = pinGameCanvas(canvas)
    if (box.width === this.viewW && box.height === this.viewH) return
    this.viewW = box.width
    this.viewH = box.height
    this.camera.aspect = box.width / box.height
    this.camera.updateProjectionMatrix()
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.setSize(box.width, box.height, false)
    pinGameCanvas(canvas)
  }

  initCamera = () => {
    this.camera.fov = 50
    this.camera.aspect = window.innerWidth / window.innerHeight
    this.camera.near = 0.01
    this.camera.far = 640
    this.camera.updateProjectionMatrix()
    this.camera.position.set(8, 50, 8)

    this.camera.lookAt(100, 30, 100)
  }

  initScene = () => {
    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.Fog(0x8ec8ea, 46, 108)
    this.scene.background = new THREE.Color(0x7eb7e6)
    const dome = new Sky()
    dome.scale.setScalar(900)
    const skyMat = dome.material as THREE.ShaderMaterial
    skyMat.fog = false
    const sunPos = new THREE.Vector3()
    const phi = ((90 - 28) * Math.PI) / 180
    const theta = (180 * Math.PI) / 180
    sunPos.setFromSphericalCoords(1, phi, theta)
    skyMat.uniforms['sunPosition'].value.copy(sunPos)
    skyMat.uniforms['turbidity'].value = 2
    skyMat.uniforms['rayleigh'].value = 1
    skyMat.uniforms['mieCoefficient'].value = 0.004
    skyMat.uniforms['mieDirectionalG'].value = 0.76
    dome.name = 'sky'
    this.scene.add(dome)

    const sun = new THREE.DirectionalLight(0xfff1c8, 1.55)
    sun.position.copy(sunPos).multiplyScalar(120)
    this.scene.add(sun)
    this.scene.add(new THREE.HemisphereLight(0x8ea4b8, 0x2a3828, 0.48))
    this.scene.add(new THREE.AmbientLight(0xc8c0b0, 0.3))
    this.addWater()
    this.addClouds()
    this.addCamp()
  }

  addCamp = () => {
    const sand = new THREE.Mesh(
      new THREE.CylinderGeometry(16, 16, 0.45, 24),
      new THREE.MeshStandardMaterial({ color: '#6e2824', roughness: 1 })
    )
    sand.position.set(34, 25.8, -8)
    this.scene.add(sand)
    const stone = new THREE.MeshStandardMaterial({ color: '#4e5258', roughness: 0.9 })
    for (const [x, z] of [[32, -6], [38, -6], [32, -12], [38, -12]] as const) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(1.2, 3.2, 1.2), stone)
      post.position.set(x, 27.4, z)
      this.scene.add(post)
    }
    const fire = new THREE.PointLight(0xff8a3c, 2.6, 18, 2)
    fire.position.set(35, 27.2, -9)
    this.scene.add(fire)
  }

  addWater = () => {
    const material = new THREE.ShaderMaterial({
      transparent: true,
      fog: true,
      uniforms: { time: { value: 0 } },
      vertexShader: `
        uniform float time;
        varying vec2 vUv;
        varying float vWave;
        #include <fog_pars_vertex>
        void main() {
          vUv = uv;
          vec3 p = position;
          float wave = sin(p.x * 0.08 + time * 1.6) * 0.35 + cos(p.y * 0.06 + time * 1.1) * 0.25;
          p.z += wave;
          vWave = wave;
          vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        varying float vWave;
        #include <fog_pars_fragment>
        void main() {
          vec3 deep = vec3(0.02, 0.18, 0.38);
          vec3 mid = vec3(0.10, 0.48, 0.66);
          vec3 color = mix(mid, deep, smoothstep(0.0, 1.0, vUv.y));
          float spark = pow(max(sin(vUv.x * 90.0 + vWave * 6.0), 0.0), 24.0);
          color += vec3(0.55, 0.62, 0.5) * spark;
          gl_FragColor = vec4(color, 0.94);
          #include <fog_fragment>
        }
      `
    })
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(1600, 640, 32, 16), material)
    sea.name = 'sea'
    sea.rotation.x = -Math.PI / 2
    sea.position.set(0, 25.5, 384)
    this.scene.add(sea)
    this.water = material
  }

  addClouds = () => {
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 64
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const glow = ctx.createRadialGradient(64, 32, 4, 64, 32, 52)
    glow.addColorStop(0, 'rgba(255,255,255,0.85)')
    glow.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, 128, 64)
    const map = new THREE.CanvasTexture(canvas)
    const mat = new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, opacity: 0.78 })
    for (let i = 0; i < 9; i++) {
      const cloud = new THREE.Sprite(mat)
      cloud.position.set((i - 4) * 38 + (i % 3) * 6, 62 + (i % 4) * 4, (i % 5) * 30 - 40)
      cloud.scale.set(46, 18, 1)
      this.scene.add(cloud)
      this.clouds.push(cloud)
    }
  }

  update = () => {
    this.fit()
    if (this.water) this.water.uniforms['time'].value = performance.now() * 0.0004
    for (const cloud of this.clouds) {
      cloud.position.x += 0.03
      if (cloud.position.x > 200) cloud.position.x = -200
    }
  }

  initRenderer = () => {
    installViewportLock()
    const canvas = this.renderer.domElement
    canvas.style.display = 'block'
    canvas.style.touchAction = 'none'
    document.body.appendChild(canvas)
    this.fit()
    this.renderer.outputEncoding = THREE.sRGBEncoding
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 0.62

    const refit = () => {
      healViewport()
      this.viewW = 0
      this.viewH = 0
      this.fit()
    }
    window.addEventListener('resize', refit)
    window.addEventListener('orientationchange', refit)
    window.visualViewport?.addEventListener('resize', refit)
    window.visualViewport?.addEventListener('scroll', refit)
  }
}
