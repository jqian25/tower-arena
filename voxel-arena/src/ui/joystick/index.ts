import * as THREE from 'three'
import Control from '../../control'
import { htmlToDom } from '../../utils'
import UI from './joystick.html?raw'

const ACTS = ['swap', 'reload', 'mine', 'place', 'block', 'scope', 'pause', 'fire', 'jump'] as const
type Act = (typeof ACTS)[number]

function isAct(value: string | null): value is Act {
  return !!value && (ACTS as readonly string[]).includes(value)
}

export default class Joystick {
  constructor(control: Control, onPause: () => void) {
    this.control = control
    this.onPause = onPause
    this.euler = new THREE.Euler(0, 0, 0, 'YXZ')
  }

  control: Control
  onPause: () => void
  euler: THREE.Euler
  ready = false
  shown = false
  root: HTMLElement | null = null
  stickId: number | null = null
  lookId: number | null = null
  lookX = 0
  lookY = 0
  mouseId: number | null = null
  mouseX = 0
  mouseY = 0
  mouseMoved = false
  mineTimer?: ReturnType<typeof setInterval>
  shotAt = 0

  init = () => {
    this.show()
  }

  show = () => {
    if (!this.ready) this.mount()
    if (this.root) this.root.hidden = false
    this.shown = true
  }

  hide = () => {
    this.shown = false
    if (this.root) this.root.hidden = true
    this.releaseStick()
    this.releaseHold()
    this.lookId = null
    this.mouseId = null
  }

  private mount() {
    htmlToDom(UI)
    this.root = document.querySelector('.touch-pad')
    this.ready = true
    this.bindStick()
    this.bindActions()
    this.bindLook()
  }

  private bindStick() {
    const base = document.querySelector('#move-stick') as HTMLElement
    const knob = document.querySelector('#move-knob') as HTMLElement
    const move = (event: PointerEvent) => {
      const rect = base.getBoundingClientRect()
      const dx = event.clientX - (rect.left + rect.width / 2)
      const dy = event.clientY - (rect.top + rect.height / 2)
      const max = rect.width / 2
      const mag = Math.hypot(dx, dy) || 1
      const scale = Math.min(max, mag) / mag
      const x = (dx * scale) / max
      const y = (dy * scale) / max
      const travel = max * 0.62
      knob.style.transform = `translate(calc(-50% + ${x * travel}px), calc(-50% + ${y * travel}px))`
      this.applyStick(x, y)
    }
    base.addEventListener('pointerdown', event => {
      if (event.button !== 0) return
      this.stickId = event.pointerId
      try {
        base.setPointerCapture(event.pointerId)
      } catch {
        // A pointer that is already gone cannot be captured. The stick still tracks this id.
      }
      move(event)
      event.stopPropagation()
    })
    base.addEventListener('pointermove', event => {
      if (this.stickId !== event.pointerId) return
      move(event)
      event.stopPropagation()
    })
    const end = (event: PointerEvent) => {
      if (this.stickId !== event.pointerId) return
      this.releaseStick()
    }
    base.addEventListener('pointerup', end)
    base.addEventListener('pointercancel', end)
    base.addEventListener('lostpointercapture', end)
  }

  private releaseStick() {
    this.stickId = null
    const knob = document.querySelector('#move-knob') as HTMLElement | null
    if (knob) knob.style.transform = 'translate(-50%, -50%)'
    this.applyStick(0, 0)
  }

  private applyStick(x: number, y: number) {
    const dead = 0.18
    const ax = Math.abs(x) < dead ? 0 : x
    const ay = Math.abs(y) < dead ? 0 : y
    let forward = -ay
    let strafe = ax
    const mag = Math.hypot(forward, strafe)
    if (mag > 1) {
      forward /= mag
      strafe /= mag
    }
    const speed = this.control.moveSpeed()
    this.control.downKeys.w = forward > 0.2
    this.control.downKeys.s = forward < -0.2
    this.control.downKeys.a = strafe < -0.2
    this.control.downKeys.d = strafe > 0.2
    this.control.velocity.x = forward * speed
    this.control.velocity.z = strafe * speed
  }

  private bindActions() {
    document.querySelectorAll<HTMLButtonElement>('.touch-pad button[data-act]').forEach(button => {
      const act = button.dataset.act ?? null
      if (!isAct(act)) return
      let down = false
      const press = (event: Event) => {
        const pointer = event instanceof PointerEvent ? event : null
        if (pointer && pointer.button > 0) return
        if (down) return
        event.preventDefault()
        event.stopPropagation()
        down = true
        if (pointer) {
          try {
            button.setPointerCapture(pointer.pointerId)
          } catch {
            // Synthetic or already-ended pointers cannot be captured. The action still runs.
          }
        }
        this.press(act)
      }
      const release = () => {
        if (!down) return
        down = false
        this.release(act)
      }
      button.addEventListener('pointerdown', press)
      button.addEventListener('touchstart', press, { passive: false })
      button.addEventListener('pointerup', release)
      button.addEventListener('pointercancel', release)
      button.addEventListener('lostpointercapture', release)
      button.addEventListener('touchend', release)
      button.addEventListener('touchcancel', release)
      button.addEventListener('click', event => {
        if (act !== 'fire' && act !== 'scope' && act !== 'pause') return
        event.preventDefault()
        if (performance.now() - this.shotAt < 450) return
        this.press(act)
        if (act === 'fire') this.release('fire')
      })
    })
  }

  private press(act: Act) {
    this.shotAt = performance.now()
    switch (act) {
      case 'fire':
        this.control.mining = false
        this.control.firing = true
        this.control.onPrimary?.()
        break
      case 'reload':
        this.control.onReload?.()
        break
      case 'swap':
        this.control.onSwap?.()
        break
      case 'block':
        this.control.cycleBlock()
        break
      case 'scope':
        this.control.onScope?.()
        break
      case 'mine':
        this.control.mining = true
        this.control.mousedownHandler(this.click(0))
        this.mineTimer = setInterval(() => {
          this.control.mousedownHandler(this.click(0))
        }, 333)
        break
      case 'place':
        this.control.mousedownHandler(this.click(2))
        break
      case 'jump':
        this.control.setMovementHandler(this.key(' '))
        break
      case 'pause':
        this.onPause()
        break
      default: {
        const neverAct: never = act
        throw new Error(`unhandled touch action ${neverAct}`)
      }
    }
  }

  private release(act: Act) {
    switch (act) {
      case 'fire':
        this.control.firing = false
        break
      case 'mine':
        this.control.mining = false
        this.mineTimer && clearInterval(this.mineTimer)
        this.mineTimer = undefined
        this.control.mouseupHandler()
        break
      case 'jump':
        this.control.resetMovementHandler(this.key(' '))
        break
      case 'reload':
      case 'swap':
      case 'block':
      case 'scope':
      case 'place':
      case 'pause':
        break
      default: {
        const neverAct: never = act
        throw new Error(`unhandled touch action ${neverAct}`)
      }
    }
  }

  private releaseHold() {
    this.control.firing = false
    this.control.mining = false
    this.mineTimer && clearInterval(this.mineTimer)
    this.mineTimer = undefined
    this.control.mouseupHandler()
    this.control.resetMovementHandler(this.key(' '))
  }

  private bindLook() {
    const blocked = '.touch-pad, .menu, .features, .settings, button, a, input, label'
    document.addEventListener('pointerdown', event => {
      if (!this.shown || event.button > 0) return
      const target = event.target
      if (target instanceof Element && target.closest(blocked)) return
      if (event.pointerType === 'touch' || event.pointerType === 'pen') {
        this.lookId = event.pointerId
        this.lookX = event.clientX
        this.lookY = event.clientY
        return
      }
      this.mouseId = event.pointerId
      this.mouseX = event.clientX
      this.mouseY = event.clientY
      this.mouseMoved = false
    })
    document.addEventListener('pointermove', event => {
      if (this.lookId === event.pointerId) {
        this.turn(event.clientX - this.lookX, event.clientY - this.lookY)
        this.lookX = event.clientX
        this.lookY = event.clientY
        return
      }
      if (this.mouseId !== event.pointerId) return
      const dx = event.clientX - this.mouseX
      const dy = event.clientY - this.mouseY
      if (Math.hypot(dx, dy) < 4) return
      this.mouseMoved = true
      this.turn(dx, dy)
      this.mouseX = event.clientX
      this.mouseY = event.clientY
    })
    const end = (event: PointerEvent) => {
      if (this.lookId === event.pointerId) this.lookId = null
      if (this.mouseId !== event.pointerId) return
      const shoot = !this.mouseMoved && event.button === 0
      this.mouseId = null
      if (shoot) this.control.onPrimary?.()
    }
    document.addEventListener('pointerup', end)
    document.addEventListener('pointercancel', end)
  }

  private turn(dx: number, dy: number) {
    this.euler.setFromQuaternion(this.control.camera.quaternion)
    const scale = this.control.lookScale
    this.euler.y -= dx * 0.0045 * scale
    this.euler.x -= dy * 0.0035 * scale
    const limit = Math.PI / 2 - 0.02
    this.euler.x = Math.max(-limit, Math.min(limit, this.euler.x))
    this.euler.z = 0
    this.control.camera.quaternion.setFromEuler(this.euler)
  }

  private key(key: string) {
    return { key, repeat: false } as KeyboardEvent
  }

  private click(button: number) {
    return {
      button,
      preventDefault() {}
    } as MouseEvent
  }
}
