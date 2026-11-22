import Core from './core'
import Control from './control'
import Player from './player'
import Terrain, { BlockType } from './terrain'
import UI from './ui'
import Audio from './audio'
import Combat from './combat'
import { arena } from './arena/net'
import { createPack } from './ui/pack'

import './style.css'
import { createSlide } from './world/slide'
import { loadLandmarkProps } from './world/props'
import { createHouses } from './world/interior'
import { createAirport } from './world/airport'
import { createFlight } from './world/flight'
import { createSwim } from './world/swim'
import { terrainHeight } from '../height.js'

const core = new Core()
const camera = core.camera
const scene = core.scene
const renderer = core.renderer

const player = new Player()
const audio = new Audio(camera)

const terrain = new Terrain(scene, camera)
const control = new Control(scene, camera, player, terrain, audio)
const combat = new Combat(scene, camera, terrain, control)
control.onPrimary = () => combat.pullTrigger()
control.onJump = () => {
  control.justJumped = true
  if (control.ride === 'plane') {
    control.jumpClimb = true
    return
  }
  combat.jumpIntoTrap = true
}
control.onReload = () => combat.reload()
control.onSwap = () => combat.cycle()
control.onScope = () => combat.toggleScope()
control.onMine = (type, x, y, z) => {
  arena.send({ type: 'ore', kind: type === BlockType.gold ? 'gold' : 'diamond', x, y, z })
}
arena.connect()

const ui = new UI(terrain, control)
const groundAt = (x: number, z: number) => {
  const noise = terrain.noise
  return terrainHeight(x, z, noise.get(x / noise.gap, z / noise.gap, noise.seed))
}
const slide = createSlide(scene, camera, control, groundAt)
combat.onSkin = id => slide.equip(id)
combat.onLadder = () => slide.press()
loadLandmarkProps(scene, groundAt)
const airfield = createAirport(scene, groundAt)
const flight = createFlight(camera, control, groundAt, text => combat.pushFeed(text))
const swim = createSwim(
  scene,
  camera,
  control,
  groundAt,
  text => combat.pushFeed(text),
  () => combat.inPit || control.hold,
  level => {
    combat.fishLevel = level
  }
)
const houses = createHouses(
  scene,
  camera,
  control,
  groundAt,
  text => combat.pushFeed(text),
  () => combat.inPit,
  () => combat.down
)
const ladderButton = document.querySelector<HTMLButtonElement>('#ladder')
let ladderCaptured = false
ladderButton?.addEventListener('pointerdown', event => {
  if (houses.isInside()) return
  event.preventDefault()
  ladderCaptured = false
  try {
    ladderButton.setPointerCapture(event.pointerId)
    ladderCaptured = true
  } catch {
    // Holding still starts the climb when the pointer cannot be captured.
  }
  slide.setHeld(true)
})
const releaseLadder = () => {
  ladderCaptured = false
  slide.setHeld(false)
}
ladderButton?.addEventListener('pointerup', releaseLadder)
ladderButton?.addEventListener('pointercancel', releaseLadder)
ladderButton?.addEventListener('lostpointercapture', () => {
  if (!ladderCaptured) return
  releaseLadder()
})
const pack = createPack({
  guns: [
    { id: 'rifle', name: '步枪', mark: '步' },
    { id: 'shotgun', name: '霰弹', mark: '霰' },
    { id: 'smg', name: '冲锋', mark: '冲' },
    { id: 'sniper', name: '狙击', mark: '狙' },
    { id: 'knife', name: '小刀', mark: '刀' }
  ],
  gunIndex: () => combat.gunIndex,
  onGun: index => {
    combat.gunIndex = index
    combat.paint()
    combat.paintScope()
    pack.sync()
  },
  onGear: gear => {
    combat.glass = gear.glass
    combat.drumOn = gear.drum
    if (gear.drum) combat.reload()
    arena.send({ type: 'gear', vest: gear.vest })
    pack.sync()
  },
  describe: () => {
    const gun = combat.gun()
    const pool = combat.ammo[combat.gunIndex]
    return `${gun.name}  伤害 ${gun.damage}  射程 ${gun.range}  ${pool.mag}/${pool.reserve}`
  }
})
pack.setOwned(['rifle'])
combat.onOwned = () => pack.setOwned([...combat.unlocked])
combat.onVest = () => {
  pack.gear.vest = true
  pack.sync()
}
const openShop = () => {
  document.querySelector('#shop')?.classList.remove('hidden')
  combat.paintShop()
}
document.querySelector('#shop-open')?.addEventListener('click', openShop)
document.querySelector('#purse')?.addEventListener('click', openShop)
document.querySelector('#pay-money')?.addEventListener('click', () => {
  combat.payGold = false
  document.querySelector('#pay-money')?.classList.add('on')
  document.querySelector('#pay-gold')?.classList.remove('on')
  combat.paintShop()
})
document.querySelector('#pay-gold')?.addEventListener('click', () => {
  combat.payGold = true
  document.querySelector('#pay-gold')?.classList.add('on')
  document.querySelector('#pay-money')?.classList.remove('on')
  combat.paintShop()
})
document.querySelectorAll<HTMLButtonElement>('[data-buy]').forEach(button => {
  button.addEventListener('click', () => {
    const item = button.dataset.buy
    if (!item) return
    if (item === 'vest' && arena.vest) {
      combat.pushFeed('已经穿着背心')
      return
    }
    if (item === 'drum' && arena.drum) {
      combat.pushFeed('弹匣已经买过了')
      return
    }
    if (item === 'glass' && arena.glass) {
      combat.pushFeed('稳镜已经买过了')
      return
    }
    const selling = item.startsWith('sell-')
    arena.send({ type: 'buy', item, pay: !selling && combat.payGold ? 'gold' : undefined })
  })
})
document.querySelector('#shop-close')?.addEventListener('click', () => {
  document.querySelector('#shop')?.classList.add('hidden')
})
document.querySelector('#throw')?.addEventListener('click', () => combat.throwGrenade())
document.querySelector('#feed-pet')?.addEventListener('click', () => combat.tryFeed())
document.querySelector('#drive')?.addEventListener('click', () => combat.tryDrive())
document.querySelector('#ladder')?.addEventListener('click', () => {
  if (!control.hold && !houses.isInside()) slide.press()
})
window.addEventListener('keydown', event => {
  if ((event.key === 'b' || event.key === 'B') && !event.repeat) pack.toggle()
})
document.querySelector('#play')?.addEventListener('click', () => {
  window.setTimeout(showPack, 0)
})
document.querySelector('#save')?.addEventListener('click', () => {
  window.setTimeout(showPack, 0)
})
const showPack = () => pack.setPlaying(!!document.querySelector('.menu')?.classList.contains('hidden'))
document.addEventListener('pointerlockchange', showPack)
window.setInterval(() => {
  showPack()
  pack.sync()
}, 300)

let slideClock = performance.now()
;(function animate() {
  requestAnimationFrame(animate)
  const now = performance.now()
  const dt = Math.min(0.05, (now - slideClock) / 1000)
  slideClock = now
  core.update()
  airfield.update()
  flight.update(dt)
  swim.update(dt)
  control.update()
  slide.update(dt)
  terrain.update()
  combat.update()
  houses.update()
  swim.veil()
  ui.update()
  renderer.render(scene, camera)
})()
