import { createAudio } from "./audio.js";
import { createPack } from "./pack.js";
import { buildLevel } from "./level.js";
import { createView } from "./render.js";
import { beginRun, callLift, createState, equipGun, GUNS, submitCode, update } from "./sim.js";

const BEST_KEY = "bug-tower-best-v1";
const canvas = document.querySelector("#view");
const boot = document.querySelector("#boot");
const menu = document.querySelector("#menu");
const hud = document.querySelector("#hud");
const death = document.querySelector("#death");
const deathText = document.querySelector("#death-text");
const pause = document.querySelector("#pause");
const win = document.querySelector("#win");
const help = document.querySelector("#help");
const pad = document.querySelector("#pad");
const live = document.querySelector("#live");
const touch = document.querySelector("#touch");

const DEATH = {
  eaten: "被塔虫咬住了",
  fall: "从塔上掉下去了",
  slapped: "被傀儡扇下了塔",
  magma: "踩进了熔斑",
};

const keys = new Set();
const held = { jump: false, jet: false, slap: false, spore: false, shoot: false };
let jetWas = false;
let sporeWas = false;
let slapQueued = false;
let reloadQueued = false;
let shootQueued = false;
let shotTapAt = 0;
let interactQueued = false;
let lookDrag = null;
const stick = { active: false, x: 0, y: 0, pointer: null };
let codeBuffer = "";
let lastLive = "";
let lockChangedAt = 0;
let state;
let view;
let audio;
let pack;

const params = new URLSearchParams(location.search);
const bot = params.has("bot");
const touchDevice = navigator.maxTouchPoints > 0 || matchMedia("(pointer: coarse)").matches || /iPad|iPhone|Android/i.test(navigator.userAgent);
if (touchDevice) document.documentElement.classList.add("touch-device");
let touchSprint = false;

function say(text) {
  if (!text || text === lastLive) return;
  lastLive = text;
  live.textContent = text;
}

function readBest() {
  try {
    const raw = localStorage.getItem(BEST_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeBest(run) {
  const prev = readBest();
  if (prev && prev.time <= run.time) return prev;
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify(run));
  } catch {
    return prev;
  }
  return run;
}

function formatTime(value) {
  const total = Math.max(0, value);
  const minutes = Math.floor(total / 60);
  const seconds = Math.floor(total % 60);
  const hundredths = Math.floor((total % 1) * 100);
  return minutes + ":" + String(seconds).padStart(2, "0") + "." + String(hundredths).padStart(2, "0");
}

function showBest() {
  const best = readBest();
  const node = document.querySelector("#best");
  if (!best) {
    node.hidden = true;
    return;
  }
  node.hidden = false;
  node.textContent = "最快 " + formatTime(best.time) + " · 虫茧 " + best.cocoons;
}

function paintScope() {
  const show = !!(state && state.scope && state.status === "play");
  document.querySelector("#scope").hidden = !show;
  const button = document.querySelector("[data-act=scope]");
  if (button) button.classList.toggle("on", show);
}

function toggleScope() {
  if (!state || state.status !== "play") return;
  state.scope = !state.scope;
  paintScope();
}

function queueShot() {
  shotTapAt = performance.now();
  held.shoot = true;
  shootQueued = true;
}

function setOverlay() {
  menu.hidden = state.status !== "menu";
  hud.hidden = state.status === "menu";
  touch.hidden = !(touchDevice && (state.status === "play" || state.status === "dead"));
  pause.hidden = state.status !== "pause";
  win.hidden = state.status !== "won";
  death.hidden = state.status !== "dead";
  paintScope();
  if (pack) {
    pack.setPlaying(state.status === "play");
    pack.sync();
  }
}

function startRun() {
  audio.unlock();
  state = beginRun(state.level);
  state._last = performance.now();
  if (!touchDevice && document.pointerLockElement !== canvas && !bot) {
    const lock = canvas.requestPointerLock();
    if (lock && typeof lock.catch === "function") lock.catch(() => {});
  }
  setOverlay();
  say("开始攀爬");
}

function backToMenu() {
  if (document.pointerLockElement === canvas) document.exitPointerLock();
  state = createState(state.level);
  showBest();
  setOverlay();
}

function togglePause(force) {
  if (state.status !== "play" && state.status !== "pause") return;
  const next = force === undefined ? state.status !== "pause" : force;
  if (next) {
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    state.status = "pause";
  } else {
    state.status = "play";
    if (!touchDevice) {
      const lock = canvas.requestPointerLock();
      if (lock && typeof lock.catch === "function") lock.catch(() => {});
    }
  }
  setOverlay();
}

function openHelp() {
  if (state.status === "play") togglePause(true);
  help.showModal();
}

function openPad() {
  if (document.pointerLockElement === canvas) document.exitPointerLock();
  codeBuffer = "";
  paintCode("");
  state.status = "keypad";
  pad.showModal();
}

function closePad() {
  if (pad.open) pad.close();
  if (state.status === "keypad") state.status = "play";
  setOverlay();
}

function paintCode(message) {
  const shown = (codeBuffer + "____").slice(0, 4);
  document.querySelector("#code-view").textContent = shown.split("").join(" ");
  document.querySelector("#code-msg").textContent = message || state.codeMsg || "";
}

function pushDigit(digit) {
  if (codeBuffer.length >= 4) return;
  codeBuffer += digit;
  paintCode("");
}

function submitPad() {
  const ok = submitCode(state, codeBuffer);
  paintCode(state.codeMsg);
  codeBuffer = "";
  if (ok) closePad();
}

function warnLabel() {
  if (state.worm.phase === "lunge") return "躲开";
  if (state.worm.phase === "windup") return "它张开嘴了";
  if (state.warn > 0.72) return "它到这层了";
  if (state.warn > 0.4) return "下面有动静";
  return "塔虫还在深处";
}

function syncHud() {
  document.querySelector("#floor").textContent = "第 " + state.floor + " 层 / " + state.level.loops;
  document.querySelector("#clock").textContent = formatTime(state.time);
  const total = state.level.triggers.filter((item) => item.kind === "cocoon").length;
  document.querySelector("#cocoons").textContent = "虫茧 " + state.cocoons + "/" + total;
  const height = Math.max(0.001, state.level.goal.y);
  document.querySelector("#progress-fill").style.width = Math.min(100, (state.body.y / height) * 100) + "%";
  const hint = document.querySelector("#hint");
  hint.hidden = !(state.hintT > 0 && state.hint);
  hint.textContent = state.hint;
  const near = document.querySelector("#near");
  near.hidden = !state.nearKeypad || state.status !== "play";
  near.textContent = state.liftUnlocked
    ? (touchDevice ? "点「盘」呼唤吊台" : "按 E 呼唤吊台")
    : (touchDevice ? "点「盘」打开铜盘" : "按 E 打开铜盘");
  document.querySelector("#warn-fill").style.width = Math.round(state.warn * 100) + "%";
  document.querySelector("#warn-text").textContent = warnLabel();
  document.querySelector("#warn").classList.toggle("hot", state.warn > 0.72);
  document.querySelector("#fuel-fill").style.width = Math.max(0, state.fuel) + "%";
  document.querySelector("#spores").textContent = "孢子 " + state.spores;
  const ammo = document.querySelector("#ammo");
  const duel = document.querySelector("#duel");
  if (duel) {
    const show = state.duelT > 0;
    duel.hidden = !show;
    if (show) {
      const target = state.duelMax ? state.duelName + " " + state.duelHp + "/" + state.duelMax : "";
      duel.textContent = "你 " + state.hp + "/100  " + target;
    }
  }
  if (ammo && state.gun) {
    const gun = GUNS[state.gunId] || GUNS.rifle;
    ammo.textContent = gun.name + " " + state.gun.mag + "/" + state.gun.reserve;
  }
  document.querySelector("#safe-flag").hidden = !state.safe;
  document.querySelector("#flash").style.opacity = String(Math.min(0.72, state.flash));
  paintScope();
  document.querySelector("#vignette").style.boxShadow =
    state.warn > 0.45 ? "inset 0 0 80px rgba(180, 24, 16, " + (state.warn * 0.45).toFixed(2) + ")" : "none";
  death.hidden = state.status !== "dead";
  if (state.status === "dead") {
    deathText.textContent = DEATH[state.deathReason] || "回到灯下";
    say(deathText.textContent);
  }
  if (state.hintT > 5.6 && state.hint) say(state.hint);
  if (state.status === "won" && win.hidden) {
    const record = writeBest({ time: state.time, deaths: state.deaths, cocoons: state.cocoons });
    const bestNote = record && record.time === state.time ? " 这是最快的一次。" : "";
    document.querySelector("#win-stats").textContent =
      "用时 " + formatTime(state.time) + "，掉下去 " + state.deaths + " 次，虫茧 " + state.cocoons + "/" + total + "。" + bestNote + " 下面是开源体素大地图，可以继续开枪对战。";
    say("爬到顶了");
    setOverlay();
  }
}

function readInput() {
  let ix = 0;
  let iz = 0;
  if (keys.has("KeyW") || keys.has("ArrowUp")) iz += 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) iz -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) ix += 1;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) ix -= 1;
  ix += stick.x;
  iz += -stick.y;
  const mag = Math.hypot(ix, iz);
  if (mag > 1) {
    ix /= mag;
    iz /= mag;
  }
  const yaw = state.yaw;
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  const sprint = keys.has("ShiftLeft") || keys.has("ShiftRight") || mag > 0.78 || touchSprint;
  const jet = keys.has("KeyF") || held.jet;
  const jetEdge = jet && !jetWas;
  jetWas = jet;
  const spore = keys.has("KeyQ") || held.spore;
  const sporeEdge = spore && !sporeWas;
  sporeWas = spore;
  const slap = slapQueued || held.slap;
  slapQueued = false;
  held.slap = false;
  const reload = reloadQueued;
  reloadQueued = false;
  const shoot = held.shoot || shootQueued;
  shootQueued = false;
  return {
    wishX: fx * iz + rx * ix,
    wishZ: fz * iz + rz * ix,
    jump: keys.has("Space") || held.jump,
    sprint,
    jet,
    jetEdge,
    slap,
    shoot,
    reload,
    spore: sporeEdge,
    facingX: fx,
    facingZ: fz,
  };
}

function botInput() {
  const route = state.level.route;
  if (state.botIndex === undefined) state.botIndex = 0;
  const body = state.body;
  let index = state.botIndex;
  while (index < route.length - 1) {
    const mark = route[index];
    if (Math.hypot(mark.x - body.x, mark.z - body.z) < 0.75 && body.y >= mark.y - 0.35) index += 1;
    else break;
  }
  state.botIndex = index;
  const target = route[Math.min(index, route.length - 1)];
  const dx = target.x - body.x;
  const dz = target.z - body.z;
  const dist = Math.hypot(dx, dz) || 1;
  state.yaw = Math.atan2(-dx, -dz);
  state.pitch = 0.12;
  const gap = dist > 1.45 && dist < 3.3 && Math.abs(target.y - body.y) < 1.3;
  const step = target.y > body.y + 0.55 && dist < 1.6;
  return {
    wishX: dx / dist,
    wishZ: dz / dist,
    jump: body.grounded && (gap || step),
    sprint: true,
    jet: false,
    jetEdge: false,
    slap: false,
    spore: false,
    facingX: dx / dist,
    facingZ: dz / dist,
  };
}

function frame(now) {
  try {
    const raw = (now - (state._last || now)) / 1000;
    const dt = Math.min(0.033, Number.isFinite(raw) && raw > 0 ? raw : 0.016);
    state._last = now;
    if (state.status === "menu") state.previewT += dt;
    else if (state.status === "play" || state.status === "dead") {
      if (pack && state.status === "play") {
        state.vest = pack.gear.vest;
        state.magBonus = pack.gear.drum ? 12 : 0;
        state.steady = pack.gear.glass;
        if (state.gunId !== pack.gunId) equipGun(state, pack.gunId);
      }
      const input = state.status === "play" && bot ? botInput() : state.status === "play" ? readInput() : {};
      if (state.status === "play" && interactQueued && state.nearKeypad) {
        interactQueued = false;
        if (state.liftUnlocked) callLift(state);
        else openPad();
      } else interactQueued = false;
      update(state, dt, input);
      if (state.events.indexOf("shot") !== -1) {
        const muzzle = document.querySelector("#muzzle");
        muzzle.classList.remove("go");
        void muzzle.offsetWidth;
        muzzle.classList.add("go");
      }
      audio.play(state.events);
      audio.update(state.warn);
    }
    view.render(state, dt);
    if (state.status !== "menu") syncHud();
  } catch (error) {
    boot.hidden = false;
    boot.textContent = "运行出错：" + (error && error.message ? error.message : "未知错误");
    console.error(error);
    return;
  }
  requestAnimationFrame(frame);
}

function bindKeys() {
  window.addEventListener("keydown", (event) => {
    if (event.code === "Space") event.preventDefault();
    if (pad.open) {
      if (event.code.startsWith("Digit") || event.code.startsWith("Numpad")) {
        const digit = event.code.replace("Digit", "").replace("Numpad", "");
        if (digit.length === 1) pushDigit(digit);
      } else if (event.code === "Enter") submitPad();
      else if (event.code === "Backspace") {
        codeBuffer = codeBuffer.slice(0, -1);
        paintCode("");
      }
      return;
    }
    if (help.open) return;
    keys.add(event.code);
    if (event.code === "Escape" && !pad.open && !help.open) {
      if (performance.now() - lockChangedAt < 250) return;
      if (state.status === "pause") togglePause(false);
      else if (state.status === "play") togglePause(true);
    }
    if (event.code === "KeyE") interactQueued = true;
    if (event.code === "KeyR") reloadQueued = true;
    if (event.code === "KeyM") {
      audio.setMuted(!audio.muted());
      document.querySelector("#mute").textContent = audio.muted() ? "静音" : "声音";
    }
    if (event.code === "KeyP") togglePause();
    if (event.code === "KeyC" && !event.repeat) toggleScope();
    if (event.code === "KeyB" && !event.repeat && pack) pack.toggle();
    if (event.code === "Digit1" && pack) pack.setGun("rifle");
    if (event.code === "Digit2" && pack) pack.setGun("shotgun");
    if (event.code === "Digit3" && pack) pack.setGun("smg");
    if (event.code === "Digit4" && pack) pack.setGun("sniper");
  });
  window.addEventListener("keyup", (event) => keys.delete(event.code));
  window.addEventListener("blur", () => {
    keys.clear();
    if (!bot && state.status === "play") togglePause(true);
  });
  document.addEventListener("mousemove", (event) => {
    if (state.status !== "play") return;
    if (document.pointerLockElement !== canvas && !lookDrag) return;
    const sense = state.scope ? 0.34 : 1;
    state.yaw -= event.movementX * 0.0022 * sense;
    state.pitch -= event.movementY * 0.002 * sense;
    state.pitch = Math.max(-0.45, Math.min(1.05, state.pitch));
  });
  canvas.addEventListener("mousedown", (event) => {
    if (state.status !== "play") return;
    if (event.pointerType === "touch" || event.pointerType === "pen") return;
    if (event.button === 2) {
      toggleScope();
      return;
    }
    if (event.button !== 0) return;
    if (document.pointerLockElement !== canvas) {
      const lock = canvas.requestPointerLock();
      if (lock && typeof lock.catch === "function") lock.catch(() => {});
      return;
    }
    queueShot();
  });
  window.addEventListener("mouseup", () => {
    held.shoot = false;
  });
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  document.addEventListener("pointerlockchange", () => {
    lockChangedAt = performance.now();
    if (touchDevice) return;
    if (document.pointerLockElement !== canvas && state.status === "play" && !bot && !pad.open && !help.open) {
      state.status = "pause";
      setOverlay();
    }
  });
}

function bindTouch() {
  touch.hidden = true;
  const base = document.querySelector("#stick");
  const knob = document.querySelector("#knob");
  function moveStick(event) {
    const rect = base.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const max = rect.width / 2;
    const mag = Math.hypot(dx, dy) || 1;
    const scale = Math.min(max, mag) / mag;
    stick.x = (dx * scale) / max;
    stick.y = (dy * scale) / max;
    const travel = max * 0.55;
    knob.style.transform = "translate(calc(-50% + " + stick.x * travel + "px), calc(-50% + " + stick.y * travel + "px))";
  }
  base.addEventListener("pointerdown", (event) => {
    stick.active = true;
    stick.pointer = event.pointerId;
    try {
      base.setPointerCapture(event.pointerId);
    } catch {
      // The pointer can already be gone. Movement still follows this event.
    }
    moveStick(event);
  });
  base.addEventListener("pointermove", (event) => {
    if (stick.pointer !== event.pointerId) return;
    moveStick(event);
  });
  const endStick = (event) => {
    if (stick.pointer !== event.pointerId) return;
    stick.active = false;
    stick.pointer = null;
    stick.x = 0;
    stick.y = 0;
    knob.style.transform = "translate(-50%, -50%)";
  };
  base.addEventListener("pointerup", endStick);
  base.addEventListener("pointercancel", endStick);
  document.querySelectorAll(".touch-actions button").forEach((button) => {
    const act = button.dataset.act;
    let pressed = false;
    let pressedAt = 0;
    const press = (event) => {
      if (pressed) return;
      pressed = true;
      pressedAt = performance.now();
      event.preventDefault();
      event.stopPropagation();
      if (act === "slap") queueShot();
      else if (act === "reload") reloadQueued = true;
      else if (act === "use") interactQueued = true;
      else if (act === "scope") toggleScope();
      else if (act === "sprint") {
        touchSprint = !touchSprint;
        button.classList.toggle("on", touchSprint);
      } else held[act] = true;
    };
    button.addEventListener("pointerdown", press);
    button.addEventListener("touchstart", press, { passive: false });
    const release = () => {
      if (!pressed) return;
      pressed = false;
      if (act === "slap") held.shoot = false;
      else if (act !== "reload" && act !== "use" && act !== "sprint" && act !== "scope") held[act] = false;
    };
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("pointerleave", release);
    button.addEventListener("touchend", release);
    button.addEventListener("touchcancel", release);
    button.addEventListener("click", (event) => {
      if (performance.now() - pressedAt < 450) return;
      if (act === "slap") {
        event.preventDefault();
        queueShot();
        held.shoot = false;
        return;
      }
      if (act === "scope" || act === "sprint" || act === "use" || act === "reload") {
        event.preventDefault();
        press(event);
        release();
      }
    });
  });
  canvas.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
    if (state.status !== "play") return;
    const target = event.target;
    if (target instanceof Element && target.closest("#stick, .touch-actions")) return;
    lookDrag = { id: event.pointerId, x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!lookDrag || lookDrag.id !== event.pointerId || state.status !== "play") return;
    const sense = state.scope ? 0.34 : 1;
    state.yaw -= (event.clientX - lookDrag.x) * 0.005 * sense;
    state.pitch -= (event.clientY - lookDrag.y) * 0.004 * sense;
    state.pitch = Math.max(-0.45, Math.min(1.05, state.pitch));
    lookDrag.x = event.clientX;
    lookDrag.y = event.clientY;
  });
  const endLook = (event) => {
    if (lookDrag && lookDrag.id === event.pointerId) lookDrag = null;
  };
  canvas.addEventListener("pointerup", endLook);
  canvas.addEventListener("pointercancel", endLook);
}

function bindUi() {
  document.querySelector("#start").addEventListener("click", startRun);
  document.querySelector("#help-open").addEventListener("click", openHelp);
  document.querySelector("#help-pause").addEventListener("click", openHelp);
  document.querySelector("#resume").addEventListener("click", () => togglePause(false));
  document.querySelector("#quit").addEventListener("click", backToMenu);
  document.querySelector("#to-battle").addEventListener("click", () => {
    location.href = "/battle/";
  });
  document.querySelector("#again").addEventListener("click", startRun);
  document.querySelector("#win-menu").addEventListener("click", backToMenu);
  document.querySelector("#mute").addEventListener("click", () => {
    audio.setMuted(!audio.muted());
    document.querySelector("#mute").textContent = audio.muted() ? "静音" : "声音";
  });
  const keysBox = document.querySelector("#keys");
  for (let digit = 0; digit <= 9; digit++) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = String(digit);
    button.addEventListener("click", () => pushDigit(String(digit)));
    keysBox.appendChild(button);
  }
  document.querySelector("#code-ok").addEventListener("click", submitPad);
  document.querySelector("#code-clear").addEventListener("click", () => {
    codeBuffer = "";
    paintCode("");
  });
  document.querySelector("#code-close").addEventListener("click", closePad);
  pad.addEventListener("close", () => {
    if (state.status === "keypad") state.status = "play";
    setOverlay();
  });
  window.addEventListener("resize", () => view.resize());
}

function bootGame() {
  const level = buildLevel();
  state = createState(level);
  state._last = performance.now();
  try {
    view = createView(canvas, level);
  } catch (error) {
    boot.hidden = false;
    boot.textContent = "画面没能启动：" + (error && error.message ? error.message : "需要 WebGL");
    console.error(error);
    return;
  }
  audio = createAudio();
  boot.hidden = true;
  showBest();
  pack = createPack(() => state);
  bindKeys();
  bindTouch();
  bindUi();
  setOverlay();
  document.querySelector("#start").focus();
  window.__tower = {
    get state() {
      return state;
    },
    level,
    startRun,
  };
  if (bot) startRun();
  requestAnimationFrame(frame);
}

bootGame();
