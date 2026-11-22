import { GUNS, equipGun } from "./sim.js";

const GEAR = [
  { id: "vest", name: "背心", mark: "甲", note: "挡一次咬、扇或熔斑，重生后恢复" },
  { id: "drum", name: "弹匣", mark: "匣", note: "每把枪的弹匣多 12 发" },
  { id: "glass", name: "稳镜", mark: "镜", note: "开镜时更近，子弹更集中" },
];

const EXTRA = `
.pack { pointer-events: auto; display: flex; flex-direction: column; align-items: center; gap: 8px; max-width: calc(100vw - 16px); }
[data-skin="fantasy"] {
  --font-head: "WenQuanYi Micro Hei", "Noto Sans CJK SC", sans-serif;
  --font-body: "WenQuanYi Micro Hei", "Noto Sans CJK SC", sans-serif;
}
.g-ico { width: auto; height: auto; font-size: 18px; line-height: 1; font-weight: 800; }
.inv { width: min(22rem, calc(100vw - 16px)); }
.inv-grid { grid-template-columns: repeat(4, 56px) !important; justify-content: center; }
.inv[hidden] { display: none !important; }
.islot.on { box-shadow: inset 0 0 0 3px var(--accent); }
.hslot, .islot { border: 0; color: var(--text); }
.stat, .note, .label { margin: 0; text-align: center; color: var(--text); }
.stat { font-size: 15px; font-weight: 800; }
.note, .label { font-size: 13px; color: var(--text-dim); line-height: 1.45; }
.label { margin-top: 8px; }
`;

export function createPack(getState) {
  const gear = { vest: false, drum: false, glass: false };
  let gunId = "rifle";
  const host = document.createElement("div");
  host.id = "pack-host";
  host.hidden = true;
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });
  let open = false;
  let ready = false;

  function current() {
    return GUNS[gunId] || GUNS.rifle;
  }

  function paint() {
    if (!ready) return;
    const state = getState();
    const gun = current();
    const pool = state && state.loadout ? state.loadout[gunId] : null;
    shadow.querySelectorAll("[data-pick]").forEach((node) => {
      const id = node.dataset.pick;
      node.classList.toggle("sel", id === gunId || (id === "bag" && open));
      node.classList.toggle("on", gear[id] === true);
    });
    const stat = shadow.querySelector(".stat");
    const note = shadow.querySelector(".note");
    if (stat) {
      stat.textContent = pool
        ? gun.name + "  伤害 " + gun.damage + "  弹匣 " + pool.mag + "/" + pool.reserve
        : gun.name;
    }
    if (note) {
      const lines = GEAR.filter((item) => gear[item.id]).map((item) => item.name + "：" + item.note);
      note.textContent = lines.length ? lines.join("。") : "点武器换枪，点装备穿上，再点一次脱下。";
    }
    const panel = shadow.querySelector(".inv");
    if (panel) panel.hidden = !open;
  }

  function pick(id) {
    if (id === "bag") open = !open;
    else if (id === "vest" || id === "drum" || id === "glass") gear[id] = !gear[id];
    else if (GUNS[id]) {
      gunId = id;
      const state = getState();
      if (state) equipGun(state, id);
    }
    paint();
  }

  function slot(item, hot) {
    const cls = hot ? "hslot" : "islot";
    return `<button type="button" class="${cls}" data-pick="${item.id}" data-r="rare"><span class="g-ico">${item.mark}</span><span class="h-num">${item.name}</span></button>`;
  }

  async function mount() {
    const [core, skin] = await Promise.all([
      fetch("./vendor/game-hud/core.css").then((res) => res.text()),
      fetch("./vendor/game-hud/fantasy.css").then((res) => res.text()),
    ]);
    const style = document.createElement("style");
    style.textContent = `${core}\n${skin.replaceAll('body[data-skin="fantasy"]', '[data-skin="fantasy"]')}\n${EXTRA}`;
    const wrap = document.createElement("div");
    wrap.className = "pack";
    wrap.dataset.skin = "fantasy";
    const guns = Object.values(GUNS);
    const hot = guns.map((item) => slot(item, true)).join("") + slot({ id: "bag", name: "背包", mark: "包" }, true);
    const gridGuns = guns.map((item) => slot(item, false)).join("");
    const gridGear = GEAR.map((item) => slot(item, false)).join("");
    wrap.innerHTML = `<div class="hotbar">${hot}</div><div class="panel inv" hidden><p class="stat"></p><p class="label">武器</p><div class="inv-grid">${gridGuns}</div><p class="label">装备</p><div class="inv-grid">${gridGear}</div><p class="note"></p></div>`;
    shadow.append(style, wrap);
    wrap.addEventListener("click", (event) => {
      const button = event.target instanceof Element ? event.target.closest("[data-pick]") : null;
      if (button) pick(button.dataset.pick);
    });
    ready = true;
    paint();
  }

  mount();
  return {
    gear,
    get gunId() {
      return gunId;
    },
    setPlaying(on) {
      host.hidden = !on;
      if (!on) {
        open = false;
        paint();
      }
    },
    toggle() {
      open = !open;
      paint();
    },
    setGun(id) {
      pick(id);
    },
    sync() {
      paint();
    },
  };
}
