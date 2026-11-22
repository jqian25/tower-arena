export type Gear = { vest: boolean; drum: boolean; glass: boolean }

type Gun = { id: string; name: string; mark: string }

const GEAR: Gun[] = [
  { id: 'vest', name: '背心', mark: '甲' },
  { id: 'drum', name: '弹匣', mark: '匣' },
  { id: 'glass', name: '稳镜', mark: '镜' }
]

const EXTRA = `
.pack { pointer-events: auto; display: flex; flex-direction: column; align-items: center; gap: 8px; max-width: calc(100vw - 16px); }
[data-skin="fantasy"] {
  --font-head: "WenQuanYi Micro Hei", "Noto Sans CJK SC", sans-serif;
  --font-body: "WenQuanYi Micro Hei", "Noto Sans CJK SC", sans-serif;
}
.g-ico { width: auto; height: auto; font-size: 18px; line-height: 1; font-weight: 800; }
.inv { width: min(24rem, calc(100vw - 16px)); }
.inv-grid { grid-template-columns: repeat(4, 56px) !important; justify-content: center; }
.inv[hidden] { display: none !important; }
.islot.on { box-shadow: inset 0 0 0 3px var(--accent); }
.hslot, .islot { border: 0; color: var(--text); }
.hslot[hidden], .islot[hidden] { display: none !important; }
.stat, .note, .label { margin: 0; text-align: center; color: var(--text); }
.stat { font-size: 15px; font-weight: 800; }
.note, .label { font-size: 13px; color: var(--text-dim); line-height: 1.45; }
.label { margin-top: 8px; }
`

const GEAR_NOTE: Record<string, string> = {
  vest: '背心：受到的伤害大约减到六成',
  drum: '弹匣：每把枪多装 12 发',
  glass: '稳镜：开镜时子弹更集中'
}

export function createPack(options: {
  guns: Gun[]
  onGun: (index: number) => void
  onGear: (gear: Gear) => void
  gunIndex: () => number
  describe: () => string
}) {
  const gear: Gear = { vest: false, drum: false, glass: false }
  let owned = new Set(['rifle', 'bag', 'vest', 'drum', 'glass'])
  const host = document.createElement('div')
  host.id = 'pack-host'
  host.hidden = true
  document.body.appendChild(host)
  const shadow = host.attachShadow({ mode: 'open' })
  let open = false
  let ready = false

  function paint() {
    if (!ready) return
    const current = options.guns[options.gunIndex()]?.id
    shadow.querySelectorAll<HTMLElement>('[data-pick]').forEach(node => {
      const id = node.dataset.pick || ''
      node.classList.toggle('sel', id === current || (id === 'bag' && open))
      node.classList.toggle('on', id === 'vest' ? gear.vest : id === 'drum' ? gear.drum : id === 'glass' ? gear.glass : false)
      const isGun = options.guns.some(gun => gun.id === id)
      node.hidden = isGun && !owned.has(id)
    })
    const panel = shadow.querySelector<HTMLElement>('.inv')
    if (panel) panel.hidden = !open
    const stat = shadow.querySelector('.stat')
    const note = shadow.querySelector('.note')
    if (stat) stat.textContent = options.describe()
    if (note) {
      const lines = (['vest', 'drum', 'glass'] as const).filter(id => gear[id]).map(id => GEAR_NOTE[id])
      note.textContent = lines.length ? lines.join('。') : '点武器换枪，点装备穿上，再点一次脱下。'
    }
  }

  function pick(id: string) {
    if (id === 'bag') open = !open
    else if (id === 'vest' || id === 'drum' || id === 'glass') {
      gear[id] = !gear[id]
      options.onGear(gear)
    } else {
      const index = options.guns.findIndex(gun => gun.id === id)
      if (index >= 0) options.onGun(index)
    }
    paint()
  }

  function slot(item: Gun, hot: boolean) {
    const cls = hot ? 'hslot' : 'islot'
    return `<button type="button" class="${cls}" data-pick="${item.id}" data-r="rare"><span class="g-ico">${item.mark}</span><span class="h-num">${item.name}</span></button>`
  }

  async function mount() {
    const [core, skin] = await Promise.all([
      fetch('./game-hud/core.css').then(res => res.text()),
      fetch('./game-hud/fantasy.css').then(res => res.text())
    ])
    const style = document.createElement('style')
    style.textContent = `${core}\n${skin.replaceAll('body[data-skin="fantasy"]', '[data-skin="fantasy"]')}\n${EXTRA}`
    const wrap = document.createElement('div')
    wrap.className = 'pack'
    wrap.dataset.skin = 'fantasy'
    const hot = options.guns.map(gun => slot(gun, true)).join('') + slot({ id: 'bag', name: '背包', mark: '包' }, true)
    const gridGuns = options.guns.map(gun => slot(gun, false)).join('')
    const gridGear = GEAR.map(item => slot(item, false)).join('')
    wrap.innerHTML = `<div class="hotbar">${hot}</div><div class="panel inv" hidden><p class="stat"></p><p class="label">武器</p><div class="inv-grid">${gridGuns}</div><p class="label">装备</p><div class="inv-grid">${gridGear}</div><p class="note"></p></div>`
    shadow.append(style, wrap)
    wrap.addEventListener('click', event => {
      const target = event.target
      const button = target instanceof Element ? target.closest<HTMLElement>('[data-pick]') : null
      if (button?.dataset.pick) pick(button.dataset.pick)
    })
    ready = true
    paint()
  }

  mount()
  return {
    gear,
    setPlaying(on: boolean) {
      host.hidden = !on
      if (!on) {
        open = false
        paint()
      }
    },
    toggle() {
      open = !open
      paint()
    },
    sync() {
      paint()
    },
    setOwned(ids: string[]) {
      owned = new Set([...ids, 'bag', 'vest', 'drum', 'glass'])
      paint()
    }
  }
}
