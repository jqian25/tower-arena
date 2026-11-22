import * as THREE from 'three'
import Control from '../control'
import { arena } from '../arena/net'

const AIR_SPEED = 58

export function createFlight(
  camera: THREE.PerspectiveCamera,
  control: Control,
  ground: (x: number, z: number) => number,
  note: (text: string) => void
) {
  const panel = document.querySelector<HTMLElement>('#flight')
  const modeEl = document.querySelector<HTMLElement>('#flt-mode')
  const altEl = document.querySelector<HTMLElement>('#flt-alt')
  const spdEl = document.querySelector<HTMLElement>('#flt-spd')
  const hdgEl = document.querySelector<HTMLElement>('#flt-hdg')
  const vsEl = document.querySelector<HTMLElement>('#flt-vs')
  const thrEl = document.querySelector<HTMLElement>('#flt-thr')
  const lineEl = document.querySelector<HTMLElement>('#flt-line')
  const hintEl = document.querySelector<HTMLElement>('#flt-hint')
  const button = document.querySelector<HTMLButtonElement>('#takeoff')
  const aim = new THREE.Vector3()
  let crashed = false

  const takeoff = () => {
    if (control.ride !== 'plane' || control.flying || control.room) return
    if (control.velocity.x < 6 && control.throttle < 0.35) {
      note('先按住前进加速，再起飞')
      return
    }
    control.flying = true
    control.landing = false
    control.throttle = 1
    control.rideSpeed = AIR_SPEED
    const floor = ground(camera.position.x, camera.position.z)
    if (camera.position.y < floor + 6) camera.position.y = floor + 6
    control.velocity.y = 0
    crashed = false
    note('起飞了，速度拉得很快')
  }

  const land = () => {
    if (!control.flying) return
    control.landing = true
    note('开始降落，高度会往下收')
  }

  button?.addEventListener('click', () => {
    if (control.flying) land()
    else takeoff()
  })

  const touchDown = (hard: boolean) => {
    const floor = ground(camera.position.x, camera.position.z)
    camera.position.y = floor + 1.8
    control.velocity.y = 0
    control.flying = false
    control.landing = false
    control.throttle = 0.15
    control.rideSpeed = control.taxiSpeed || 16
    if (hard && !crashed) {
      crashed = true
      arena.send({ type: 'crash' })
      note('重着陆，飞机受损')
    } else if (!hard) {
      note('已降落')
    }
  }

  return {
    update(dt: number) {
      const playing = !!document.querySelector('.menu')?.classList.contains('hidden')
      const plane = control.ride === 'plane'
      if (panel) panel.hidden = !playing || !plane
      if (button) {
        button.hidden = !playing || !plane
        button.textContent = control.flying ? '降落' : '起飞'
      }
      if (!plane) {
        if (control.flying) touchDown(false)
        return
      }
      camera.getWorldDirection(aim)
      if (control.jumpClimb && !control.flying) {
        control.jumpClimb = false
        takeoff()
      } else {
        control.jumpClimb = false
      }
      if (!control.flying) {
        const moving = control.velocity.x > 1
        const goal = moving ? 1 : 0
        control.throttle += (goal - control.throttle) * Math.min(1, dt * 1.6)
        control.airspeed = Math.abs(control.velocity.x)
        control.vspeed = 0
      } else {
        const forward = Math.hypot(aim.x, aim.z) || 1
        if (control.landing) {
          control.throttle = Math.max(0.2, control.throttle - dt * 0.45)
        } else {
          const goal = control.velocity.x > 0.4 ? 1 : 0.62
          control.throttle += (goal - control.throttle) * Math.min(1, dt * 0.8)
        }
        const speed = 26 + control.throttle * (AIR_SPEED - 26)
        control.airspeed = speed
        let climb = aim.y * 48 + (control.spaceHolding ? 14 : 0)
        if (control.landing) climb = Math.min(climb, -7)
        control.vspeed = climb
        camera.position.x += (aim.x / forward) * speed * dt
        camera.position.z += (aim.z / forward) * speed * dt
        const floor = ground(camera.position.x, camera.position.z)
        const nextY = camera.position.y + climb * dt
        const alt = nextY - floor
        if (alt < 2.6) {
          touchDown(climb < -18)
        } else {
          camera.position.y = Math.min(240, nextY)
        }
      }
      const floor = ground(camera.position.x, camera.position.z)
      const alt = Math.max(0, camera.position.y - floor)
      const heading = (Math.atan2(aim.x, aim.z) * 180) / Math.PI
      const hdg = Math.round((heading + 360) % 360)
      const mode = control.landing ? '降落' : control.flying ? '飞行' : '滑跑'
      if (modeEl) modeEl.textContent = mode
      if (altEl) altEl.textContent = `高度 ${Math.round(alt)}m`
      if (spdEl) spdEl.textContent = `速度 ${Math.round(control.airspeed * 3.6)}`
      if (hdgEl) hdgEl.textContent = `航向 ${String(hdg).padStart(3, '0')}`
      if (vsEl) vsEl.textContent = `升降 ${control.vspeed >= 0 ? '+' : ''}${Math.round(control.vspeed)}`
      if (thrEl) thrEl.textContent = `油门 ${Math.round(control.throttle * 100)}%`
      if (lineEl) lineEl.style.transform = `translateY(${(-aim.y * 36).toFixed(1)}px)`
      if (hintEl) {
        hintEl.textContent = control.landing
          ? '正在下降，贴近地面会着陆'
          : control.flying
            ? '抬头爬升，低头下降，按「降落」收油门'
            : '按住前进加速，再按「起飞」或「跳」'
      }
    },
    takeoff,
    land
  }
}
