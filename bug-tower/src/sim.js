import { HEIGHT, findGround, integrate, makeBody, moveSolid } from "./physics.js";

const PER_LOOP = 16;

export function createState(level) {
  const spawn = level.spawn;
  const state = {
    level,
    status: "menu",
    time: 0,
    deaths: 0,
    cocoons: 0,
    body: makeBody(spawn.x, spawn.y, spawn.z),
    yaw: spawn.yaw,
    pitch: 0.12,
    previewT: 0,
    worm: {
      x: 0,
      z: 0,
      y: spawn.y - 8,
      phase: "chase",
      timer: 0,
      stun: 0,
      sniff: 0,
      windupDur: 0.7,
      fromX: 0,
      fromZ: 0,
      fromY: 0,
      toX: 0,
      toZ: 0,
      toY: 0,
    },
    actors: level.actors.map((actor) => ({ ...actor })),
    solids: level.solids.map((box) => ({ ...box })),
    collected: new Set(),
    mineCool: new Map(),
    cp: { x: spawn.x, y: spawn.y, z: spawn.z, step: 0 },
    liftUnlocked: false,
    fuel: 100,
    hp: 100,
    maxHp: 100,
    duelT: 0,
    duelName: "",
    duelHp: 0,
    duelMax: 0,
    spores: 0,
    invis: 0,
    slapCd: 0,
    slapT: 0,
    gunId: "rifle",
    loadout: Object.fromEntries(Object.keys(GUNS).map((id) => [id, { mag: GUNS[id].mag, reserve: GUNS[id].reserve, cool: 0 }])),
    gun: null,
    wormHp: 180,
    shots: [],
    scope: false,
    vest: false,
    vestUsed: false,
    magBonus: 0,
    steady: false,
    glide: 0,
    iframe: 0,
    grace: 0,
    floor: 1,
    step: 0,
    deathReason: "",
    deathT: 0,
    magmaT: 0,
    hint: "",
    hintT: 0,
    hintsSeen: new Set(),
    shake: 0,
    flash: 0,
    warn: 0,
    safe: false,
    nearKeypad: false,
    codeMsg: "",
    events: [],
    lastHit: "",
    lastHitT: 0,
  };
  state.gun = state.loadout.rifle;
  return state;
}

export function beginRun(level) {
  const state = createState(level);
  state.status = "play";
  state.grace = 5.5;
  state.iframe = 1.4;
  return state;
}

function findLift(state) {
  const solids = state.solids;
  for (let i = 0; i < solids.length; i++) {
    if (solids[i].tag === "lift") return solids[i];
  }
  return null;
}

export function submitCode(state, code) {
  if (code !== state.level.code) {
    state.codeMsg = "口令不对";
    state.events.push("badcode");
    return false;
  }
  const lift = findLift(state);
  state.liftUnlocked = true;
  if (lift) {
    const mid = (lift.y0 + lift.y1) / 2;
    lift.dest = lift.top > mid ? "down" : "up";
    state.codeMsg = lift.dest === "down" ? "吊台正在下降" : "吊台正在上升";
  }
  state.events.push("code");
  return true;
}

export function callLift(state) {
  if (!state.liftUnlocked) return false;
  const lift = findLift(state);
  if (!lift) return false;
  const mid = (lift.y0 + lift.y1) / 2;
  lift.dest = lift.top > mid ? "down" : "up";
  state.codeMsg = lift.dest === "down" ? "吊台正在下降" : "吊台正在上升";
  return true;
}

function inside(trigger, x, y, z) {
  const dx = x - trigger.x;
  const dy = y - trigger.y;
  const dz = z - trigger.z;
  return dx * dx + dy * dy + dz * dz <= trigger.r * trigger.r;
}

function hasKind(state, kind, x, y, z) {
  const triggers = state.level.triggers;
  for (let i = 0; i < triggers.length; i++) {
    const trigger = triggers[i];
    if (trigger.kind === kind && inside(trigger, x, y, z)) return true;
  }
  return false;
}

function facingHit(body, fx, fz, x, z, maxDist, minDot) {
  const dx = x - body.x;
  const dz = z - body.z;
  const dist = Math.hypot(dx, dz);
  if (dist > maxDist || dist < 0.001) return false;
  const fl = Math.hypot(fx, fz) || 1;
  return (dx / dist) * (fx / fl) + (dz / dist) * (fz / fl) > minDot;
}

export const GUNS = {
  rifle: { id: "rifle", name: "步枪", mark: "步", damage: 18, delay: 0.16, pellets: 1, spread: 0.01, mag: 30, reserve: 120 },
  shotgun: { id: "shotgun", name: "霰弹", mark: "霰", damage: 8, delay: 0.7, pellets: 6, spread: 0.12, mag: 6, reserve: 24 },
  smg: { id: "smg", name: "冲锋", mark: "冲", damage: 9, delay: 0.08, pellets: 1, spread: 0.045, mag: 32, reserve: 128 },
  sniper: { id: "sniper", name: "狙击", mark: "狙", damage: 56, delay: 0.95, pellets: 1, spread: 0.002, mag: 5, reserve: 20 },
};

export function equipGun(state, id) {
  const pool = state.loadout && state.loadout[id];
  if (!pool) return false;
  state.gunId = id;
  state.gun = pool;
  return true;
}

function gunProfile(state) {
  return GUNS[state.gunId] || GUNS.rifle;
}

function magCap(state) {
  return gunProfile(state).mag + (state.magBonus || 0);
}

function wound(state, amount, label) {
  if (state.status !== "play") return;
  state.hp = Math.max(0, state.hp - amount);
  state.duelName = state.duelName || label;
  state.duelT = 2.8;
  if (state.hp <= 0) die(state, label === "塔虫" ? "eaten" : "slapped");
}

function die(state, reason) {
  if (state.status !== "play") return;
  if (state.iframe > 0 && reason !== "fall" && reason !== "slapped") return;
  if (state.vest && !state.vestUsed && reason !== "fall") {
    state.vestUsed = true;
    state.iframe = 1.5;
    state.grace = 0.8;
    state.flash = 0.45;
    state.shake = 0.25;
    state.events.push("parry");
    return;
  }
  state.scope = false;
  state.status = "dead";
  state.deathReason = reason;
  state.deathT = 0.92;
  state.deaths += 1;
  state.shake = reason === "eaten" ? 0.75 : 0.42;
  state.flash = 1;
  if (reason === "eaten") state.events.push("eat");
  else if (reason === "magma") state.events.push("burn");
  else state.events.push("fall");
}

function respawn(state) {
  const body = state.body;
  const cp = state.cp;
  body.x = cp.x;
  body.y = cp.y;
  body.z = cp.z;
  body.vx = 0;
  body.vy = 0;
  body.vz = 0;
  body.grounded = true;
  body.groundId = 0;
  body.slide = 0;
  state.vestUsed = false;
  state.iframe = 1.75;
  state.grace = 1.5;
  state.invis = 0;
  state.glide = 0;
  state.worm.y = cp.y - 7.5;
  state.worm.x = 0;
  state.worm.z = 0;
  state.worm.phase = "chase";
  state.worm.timer = 0;
  state.worm.stun = 0;
  state.worm.sniff = 0;
  state.status = "play";
  state.magmaT = 0;
  state.deathT = 0;
  state.actors = state.level.actors.map((actor) => ({ ...actor }));
  const solids = state.solids;
  for (let i = 0; i < solids.length; i++) {
    const box = solids[i];
    if (box.tag === "lift") continue;
    if (box.crumble || box.mover || box.falling) {
      box.falling = false;
      box.crumbleT = 0;
      box.disabled = false;
      box.phase = box.homePhase || 0;
      moveSolid(box, box.homeX, box.homeTop, box.homeZ);
    }
  }
  state.events.push("spawn");
}

function moveDynamics(state, dt) {
  const body = state.body;
  const solids = state.solids;
  for (let i = 0; i < solids.length; i++) {
    const box = solids[i];
    if (box.mover) {
      box.phase += dt * box.speed;
      const off = Math.sin(box.phase) * box.amp;
      const prevX = box.cx;
      const prevZ = box.cz;
      const cx = box.homeX + (box.axis === "x" ? off : 0);
      const cz = box.homeZ + (box.axis === "z" ? off : 0);
      moveSolid(box, cx, box.homeTop, cz);
      if (body.groundId === box.id) {
        body.x += box.cx - prevX;
        body.z += box.cz - prevZ;
      }
    }
    if (box.crumble) {
      if (body.grounded && body.groundId === box.id && !box.falling) box.crumbleT += dt;
      else box.crumbleT = Math.max(0, box.crumbleT - dt * 0.35);
      if (box.crumbleT > 0.5) box.falling = true;
      if (box.falling && !box.disabled) {
        const prev = box.top;
        moveSolid(box, box.cx, box.top - 6.5 * dt, box.cz);
        if (body.groundId === box.id) body.y += box.top - prev;
        if (box.top < box.homeTop - 12) box.disabled = true;
      }
    }
    if (box.tag === "lift" && box.dest) {
      const target = box.dest === "up" ? box.y1 : box.y0;
      const dir = Math.sign(target - box.top);
      if (dir === 0) box.dest = null;
      else {
        const prev = box.top;
        let next = box.top + dir * box.speed * dt;
        const arrived = dir > 0 ? next >= target : next <= target;
        if (arrived) next = target;
        moveSolid(box, box.cx, next, box.cz);
        if (body.groundId === box.id) body.y += box.top - prev;
        if (arrived) {
          box.dest = null;
          state.events.push("lift");
        }
      }
    }
  }
}

function senseWorld(state, input, dt) {
  const body = state.body;
  const x = body.x;
  const y = body.y + 0.45;
  const z = body.z;
  let safe = false;
  let magma = false;
  const triggers = state.level.triggers;
  for (let i = 0; i < triggers.length; i++) {
    const trigger = triggers[i];
    if (!inside(trigger, x, y, z)) continue;
    switch (trigger.kind) {
      case "safe":
        safe = true;
        break;
      case "goal":
        safe = true;
        if (body.grounded) {
          state.status = "won";
          state.events.push("win");
        }
        break;
      case "magma":
        magma = true;
        break;
      case "moth":
        break;
      case "banana": {
        if (state.time < (body.bananaAt || 0)) break;
        const speed = Math.hypot(body.vx, body.vz);
        const fx = speed > 0.45 ? body.vx / speed : input.facingX || 0;
        const fz = speed > 0.45 ? body.vz / speed : input.facingZ || 1;
        const fl = Math.hypot(fx, fz) || 1;
        body.vx = (fx / fl) * 9;
        body.vz = (fz / fl) * 9;
        body.slide = 0.85;
        body.bananaAt = state.time + 0.95;
        state.events.push("banana");
        state.shake = Math.max(state.shake, 0.16);
        break;
      }
      case "mine": {
        const until = state.mineCool.get(trigger.id) || 0;
        if (state.time < until) break;
        state.mineCool.set(trigger.id, state.time + 7);
        const dx = body.x - trigger.x;
        const dz = body.z - trigger.z;
        const dist = Math.hypot(dx, dz) || 1;
        body.vx += (dx / dist) * 11;
        body.vz += (dz / dist) * 11;
        body.vy = Math.max(body.vy, 8);
        body.grounded = false;
        state.events.push("mine");
        state.shake = 0.55;
        state.flash = Math.max(state.flash, 0.4);
        break;
      }
      case "cocoon": {
        if (state.collected.has(trigger.id)) break;
        state.collected.add(trigger.id);
        state.cocoons += 1;
        state.events.push("cocoon");
        break;
      }
      case "spore": {
        if (state.collected.has(trigger.id) || state.spores >= 2) break;
        state.collected.add(trigger.id);
        state.spores += 1;
        state.events.push("pickup");
        break;
      }
      case "checkpoint": {
        if (trigger.y <= state.cp.y + 0.4) break;
        state.cp = { x: trigger.x, y: trigger.y, z: trigger.z, step: trigger.step };
        state.fuel = Math.min(100, state.fuel + 22);
        state.iframe = Math.max(state.iframe, 0.55);
        if (state.worm.y > trigger.y - 4) state.worm.y = trigger.y - 7.5;
        state.events.push("checkpoint");
        break;
      }
      default: {
        const unknown = trigger.kind;
        throw new Error("trigger " + unknown);
      }
    }
  }
  if (magma) state.magmaT += dt;
  else state.magmaT = 0;
  if (state.magmaT > 0.36) die(state, "magma");
  state.safe = safe || state.invis > 0;
  const pad = state.level.keypad;
  state.nearKeypad = Math.hypot(body.x - pad.x, body.z - pad.z) < 2.2 && Math.abs(body.y - pad.y) < 2.3;
}

function sphereAlong(ox, oy, oz, dx, dy, dz, tx, ty, tz, radius) {
  const vx = tx - ox;
  const vy = ty - oy;
  const vz = tz - oz;
  const t = vx * dx + vy * dy + vz * dz;
  if (t < 0.4) return null;
  const px = ox + dx * t;
  const py = oy + dy * t;
  const pz = oz + dz * t;
  if (Math.hypot(tx - px, ty - py, tz - pz) > radius) return null;
  return t;
}

function shotBlocked(solids, ox, oy, oz, dx, dy, dz, until) {
  for (let t = 0.6; t < until - 0.35; t += 0.45) {
    const x = ox + dx * t;
    const y = oy + dy * t;
    const z = oz + dz * t;
    for (let i = 0; i < solids.length; i++) {
      const box = solids[i];
      if (box.disabled) continue;
      if (x < box.minX || x > box.maxX || y < box.minY || y > box.maxY || z < box.minZ || z > box.maxZ) continue;
      return true;
    }
  }
  return false;
}

function hurtActor(state, actor, damage = 18) {
  if (!actor.maxHp) actor.maxHp = actor.hp;
  actor.hp -= damage;
  state.duelName = actor.kind === "beetle" ? "甲虫" : "傀儡";
  state.duelHp = Math.max(0, actor.hp);
  state.duelMax = actor.maxHp;
  state.duelT = 2.8;
  state.events.push("hit");
  state.shake = Math.max(state.shake, 0.12);
  if (actor.hp > 0) return;
  const body = state.body;
  const dx = actor.x - body.x;
  const dz = actor.z - body.z;
  const dist = Math.hypot(dx, dz) || 1;
  actor.vx = (dx / dist) * 8;
  actor.vz = (dz / dist) * 8;
  actor.vy = 6;
  actor.falling = true;
  actor.grounded = false;
  actor.alive = false;
}

function hurtWorm(state, damage = 18) {
  const worm = state.worm;
  state.wormHp -= damage;
  state.duelName = "塔虫";
  state.duelHp = Math.max(0, state.wormHp);
  state.duelMax = 180;
  state.duelT = 2.8;
  worm.stun = Math.max(worm.stun, 0.45);
  worm.y -= 0.4;
  state.events.push("hit");
  state.shake = Math.max(state.shake, 0.2);
  if (state.wormHp > 0) return;
  state.wormHp = 180;
  worm.y -= 11;
  worm.phase = "recover";
  worm.timer = 2.4;
  worm.stun = 2.4;
  state.hint = "塔虫被打退了。继续往上。";
  state.hintT = 2.4;
}

function tryShoot(state) {
  const gun = state.gun;
  if (gun.cool > 0) return;
  if (gun.mag <= 0) {
    if (gun.reserve <= 0) return;
    const take = Math.min(magCap(state) - gun.mag, gun.reserve);
    gun.mag += take;
    gun.reserve -= take;
    gun.cool = 0.7;
    state.events.push("reload");
    return;
  }
  const profile = gunProfile(state);
  gun.mag -= 1;
  gun.cool = state.scope ? Math.max(profile.delay, 0.22) : profile.delay;
  state.events.push("shot");
  const body = state.body;
  const ox = body.x;
  const oy = body.y + 1.25;
  const oz = body.z;
  state.flash = Math.max(state.flash, 0.28);
  const spread = state.steady && state.scope ? profile.spread * 0.3 : profile.spread;
  let tracer = null;
  for (let pellet = 0; pellet < profile.pellets; pellet++) {
    const yaw = state.yaw + (pellet === 0 ? 0 : (Math.random() - 0.5) * spread);
    const pitch = state.pitch + (pellet === 0 ? 0 : (Math.random() - 0.5) * spread * 0.65);
    const cos = Math.cos(pitch);
    const dx = -Math.sin(yaw) * cos;
    const dy = Math.sin(pitch);
    const dz = -Math.cos(yaw) * cos;
    let best = null;
    const consider = (t, apply) => {
      if (t == null || t > 40) return;
      if (shotBlocked(state.solids, ox, oy, oz, dx, dy, dz, t)) return;
      if (!best || t < best.t) best = { t, apply };
    };
    for (let i = 0; i < state.actors.length; i++) {
      const actor = state.actors[i];
      if (!actor.alive || actor.hp <= 0) continue;
      consider(sphereAlong(ox, oy, oz, dx, dy, dz, actor.x, actor.y + 0.75, actor.z, 0.95), () => hurtActor(state, actor, profile.damage));
    }
    const worm = state.worm;
    consider(sphereAlong(ox, oy, oz, dx, dy, dz, worm.x, worm.y + 0.55, worm.z, 1.25), () => hurtWorm(state, profile.damage));
    if (!tracer) tracer = { dx, dy, dz, reach: best ? Math.max(0.8, best.t) : 16 };
    if (best) best.apply();
  }
  if (tracer) {
    state.shots.push({ x: ox, y: oy, z: oz, dx: tracer.dx, dy: tracer.dy, dz: tracer.dz, life: 0.38, maxLife: 0.38, reach: tracer.reach });
  }
}

function trySlap(state, input) {
  if (state.slapCd > 0) return;
  state.slapCd = 0.48;
  state.slapT = 0.16;
  state.events.push("slap");
  const body = state.body;
  const fx = input.facingX || 0;
  const fz = input.facingZ || 1;
  const worm = state.worm;
  if (
    worm.phase === "windup" &&
    Math.abs(body.y + 0.6 - worm.y) < 2.4 &&
    facingHit(body, fx, fz, worm.x, worm.z, 2.7, 0.12)
  ) {
    worm.phase = "recover";
    worm.timer = 1.35;
    worm.stun = 1.35;
    worm.y -= 1.6;
    state.shake = 0.4;
    state.events.push("parry");
    return;
  }
  const actors = state.actors;
  for (let i = 0; i < actors.length; i++) {
    const actor = actors[i];
    if (!actor.alive || actor.falling) continue;
    if (Math.abs(actor.y - body.y) > 1.5) continue;
    if (!facingHit(body, fx, fz, actor.x, actor.z, 2.05, 0.18)) continue;
    const dx = actor.x - body.x;
    const dz = actor.z - body.z;
    const dist = Math.hypot(dx, dz) || 1;
    actor.vx = (dx / dist) * 10;
    actor.vz = (dz / dist) * 10;
    actor.vy = 6.5;
    actor.falling = true;
    actor.grounded = false;
    actor.stun = 0.8;
    state.events.push("hit");
  }
}

function updateWorm(state, dt) {
  const worm = state.worm;
  const body = state.body;
  const safe = state.safe;
  const invis = state.invis > 0;
  worm.stun = Math.max(0, worm.stun - dt);
  const loop = Math.max(0, Math.min(5, state.floor - 1));
  const gap = body.y - worm.y;
  let climb = 0.78 + loop * 0.12;
  if (gap > 10) climb *= 1.45;
  if (gap < 1.8) climb *= 0.65;
  if (safe || invis) climb = 0.22;
  if (worm.stun > 0 || state.grace > 0) climb *= 0.35;
  const dist = Math.hypot(body.x, body.z) || 1;
  const homeX = (body.x / dist) * 2.25;
  const homeZ = (body.z / dist) * 2.25;

  switch (worm.phase) {
    case "chase": {
      worm.x += (homeX - worm.x) * Math.min(1, dt * 2.4);
      worm.z += (homeZ - worm.z) * Math.min(1, dt * 2.4);
      if (body.y + 1.2 < worm.y && !safe) worm.y -= 8 * dt;
      else if (worm.y < body.y - 1.7) worm.y += climb * dt;
      if (safe || invis) {
        worm.sniff += dt;
        if (worm.sniff > 2.45 && Math.abs(gap) < 6.5) {
          worm.y -= 8.5;
          worm.sniff = 0;
          worm.phase = "recover";
          worm.timer = 1.15;
          state.hint = "它退下去了。现在走。";
          state.hintT = 2.4;
        }
      } else worm.sniff = Math.max(0, worm.sniff - dt);
      const close = gap < 2.35 && gap > -0.4 && !safe && !invis && state.grace <= 0 && worm.stun <= 0;
      if (close) {
        worm.phase = "windup";
        worm.windupDur = Math.max(0.4, 0.88 - loop * 0.07);
        worm.timer = worm.windupDur;
        state.events.push("windup");
      }
      break;
    }
    case "windup": {
      worm.timer -= dt;
      const k = 1 - Math.max(worm.timer, 0) / (worm.windupDur || 0.7);
      const radius = 2.2 + 2.8 * Math.min(1, Math.max(0, k));
      worm.x = (body.x / dist) * radius;
      worm.z = (body.z / dist) * radius;
      worm.y += (body.y - worm.y) * Math.min(1, dt * 5);
      if (safe || invis) {
        worm.phase = "recover";
        worm.timer = 0.85;
        break;
      }
      if (worm.timer <= 0) {
        worm.phase = "lunge";
        worm.timer = 0.36;
        worm.fromX = worm.x;
        worm.fromZ = worm.z;
        worm.fromY = worm.y;
        const playerDist = Math.hypot(body.x, body.z) || 1;
        const reach = Math.min(playerDist, 12);
        worm.toX = (body.x / playerDist) * reach;
        worm.toZ = (body.z / playerDist) * reach;
        worm.toY = body.y;
      }
      break;
    }
    case "lunge": {
      worm.timer -= dt;
      const k = 1 - Math.max(worm.timer, 0) / 0.36;
      const eased = k * k;
      worm.x = worm.fromX + (worm.toX - worm.fromX) * eased;
      worm.z = worm.fromZ + (worm.toZ - worm.fromZ) * eased;
      worm.y = worm.fromY + (worm.toY - worm.fromY) * Math.min(1, eased * 1.15);
      if (k > 0.62 && state.iframe <= 0 && !safe && !invis) {
        const hit = Math.hypot(body.x - worm.x, body.z - worm.z);
        if (hit < 1.2 && Math.abs(body.y - worm.y) < 1.45) {
          wound(state, 100, "塔虫");
          if (state.status === "play") state.iframe = 0.8;
        }
      }
      if (worm.timer <= 0 && state.status === "play") {
        worm.phase = "recover";
        worm.timer = 0.95;
      }
      break;
    }
    case "recover": {
      worm.timer -= dt;
      worm.x += (homeX - worm.x) * Math.min(1, dt * 3);
      worm.z += (homeZ - worm.z) * Math.min(1, dt * 3);
      if (worm.y > body.y - 3.2) worm.y -= 2.4 * dt;
      if (worm.timer <= 0) worm.phase = "chase";
      break;
    }
    default: {
      const unknown = worm.phase;
      throw new Error("worm " + unknown);
    }
  }
  const vertical = Math.max(0, body.y - worm.y);
  state.warn = worm.phase === "lunge" || worm.phase === "windup" ? 1 : Math.max(0, 1 - vertical / 11);
}

function updateActors(state, dt) {
  const body = state.body;
  const solids = state.solids;
  for (let i = 0; i < state.actors.length; i++) {
    const actor = state.actors[i];
    if (!actor.alive) continue;
    if (actor.falling || !actor.grounded) {
      actor.vy -= 32 * dt;
      actor.x += actor.vx * dt;
      actor.z += actor.vz * dt;
      actor.y += actor.vy * dt;
      const ground = findGround(actor.x, actor.y, actor.z, solids, Math.max(0.25, -actor.vy * dt + 0.05));
      if (actor.vy <= 0 && ground && actor.y - ground.y < 0.5 && actor.y >= ground.y - 0.25) {
        actor.y = ground.y;
        actor.vy = 0;
        actor.vx *= 0.2;
        actor.vz *= 0.2;
        actor.falling = false;
        actor.grounded = true;
      } else if (actor.y < -8 || actor.y < state.cp.y - 10) actor.alive = false;
      continue;
    }
    if (actor.stun > 0) {
      actor.stun -= dt;
      continue;
    }
    const dx = body.x - actor.x;
    const dz = body.z - actor.z;
    const dist = Math.hypot(dx, dz);
    const same = Math.abs(body.y - actor.y) < 1.35;
    const hidden = state.invis > 0;
    switch (actor.kind) {
      case "beetle": {
        if (same && dist < 7 && !hidden) {
          const len = dist || 1;
          actor.x += (dx / len) * 3.5 * dt;
          actor.z += (dz / len) * 3.5 * dt;
          const ground = findGround(actor.x, actor.y, actor.z, solids, 0.35);
          if (!ground) {
            actor.falling = true;
            actor.grounded = false;
            actor.vy = 0;
          } else actor.y = ground.y;
        } else {
          actor.phase += dt;
          const wave = Math.sin(actor.phase * 1.4) * 0.9;
          actor.x = actor.homeX + Math.cos(actor.along) * wave;
          actor.z = actor.homeZ + Math.sin(actor.along) * wave;
          actor.y = actor.homeY;
        }
        if (same && dist < 0.95 && state.iframe <= 0 && !hidden && state.status === "play") {
          const len = dist || 1;
          body.vx += (dx / len) * 8;
          body.vz += (dz / len) * 8;
          body.vy = Math.max(body.vy, 5.5);
          body.grounded = false;
          wound(state, 12, "甲虫");
          state.iframe = 0.5;
          state.lastHit = "beetle";
          state.lastHitT = state.time;
          state.shake = Math.max(state.shake, 0.28);
          state.events.push("hurt");
        }
        break;
      }
      case "slapper": {
        actor.timer -= dt;
        if (actor.state === "idle") {
          if (same && dist < 4.3 && !hidden) {
            actor.state = "windup";
            actor.timer = 0.7;
          }
        } else if (actor.state === "windup") {
          if (!same || hidden || dist > 5.2) actor.state = "idle";
          else if (actor.timer <= 0) {
            actor.state = "swing";
            actor.timer = 0.18;
            if (dist < 2.3 && state.iframe <= 0 && state.status === "play") {
              const len = dist || 1;
              body.vx += (dx / len) * 12;
              body.vz += (dz / len) * 12;
              body.vy = Math.max(body.vy, 6.2);
              body.grounded = false;
              wound(state, 22, "傀儡");
              state.iframe = 0.45;
              state.lastHit = "slapper";
              state.lastHitT = state.time;
              state.shake = 0.5;
              state.events.push("hurt");
            }
          }
        } else if (actor.state === "swing") {
          if (actor.timer <= 0) {
            actor.state = "recover";
            actor.timer = 0.8;
          }
        } else if (actor.state === "recover") {
          if (actor.timer <= 0) actor.state = "idle";
        } else actor.state = "idle";
        break;
      }
      default: {
        const unknown = actor.kind;
        throw new Error("actor " + unknown);
      }
    }
  }
}

function fallCheck(state) {
  if (state.status !== "play") return;
  const body = state.body;
  const inShaft = Math.hypot(body.x, body.z) < 3.05;
  if (
    inShaft &&
    state.iframe <= 0 &&
    state.invis <= 0 &&
    !state.safe &&
    body.y < state.worm.y + 0.8 &&
    body.y > state.worm.y - 14
  ) {
    die(state, "eaten");
    return;
  }
  if (body.y < -14 || body.y < state.cp.y - 16) {
    const slapped = state.lastHit === "slapper" && state.time - state.lastHitT < 2;
    die(state, slapped ? "slapped" : "fall");
  }
}

function hints(state) {
  const step = Math.max(0, Math.round(state.body.y / state.level.rise));
  state.step = step;
  state.floor = Math.min(state.level.loops, Math.floor(step / PER_LOOP) + 1);
  const list = state.level.hints;
  for (let i = 0; i < list.length; i++) {
    const hint = list[i];
    if (step < hint.step || state.hintsSeen.has(hint.id)) continue;
    state.hintsSeen.add(hint.id);
    state.hint = hint.text;
    state.hintT = 6.2;
  }
}

export function update(state, dt, input = {}) {
  state.events.length = 0;
  state.flash = Math.max(0, state.flash - dt * 1.35);
  state.shake = Math.max(0, state.shake - dt);
  if (state.hintT > 0) state.hintT -= dt;
  if (state.status === "dead") {
    state.deathT -= dt;
    if (state.deathT <= 0) respawn(state);
    return;
  }
  if (state.status !== "play") return;

  const body = state.body;
  const stepDt = Math.min(dt, 0.05);
  state.time += stepDt;
  state.iframe = Math.max(0, state.iframe - stepDt);
  state.grace = Math.max(0, state.grace - stepDt);
  state.invis = Math.max(0, state.invis - stepDt);
  state.slapCd = Math.max(0, state.slapCd - stepDt);
  state.slapT = Math.max(0, state.slapT - stepDt);
  state.duelT = Math.max(0, state.duelT - stepDt);
  const pools = state.loadout ? Object.values(state.loadout) : [state.gun];
  for (let i = 0; i < pools.length; i++) pools[i].cool = Math.max(0, pools[i].cool - stepDt);
  for (let i = state.shots.length - 1; i >= 0; i--) {
    state.shots[i].life -= stepDt;
    if (state.shots[i].life <= 0) state.shots.splice(i, 1);
  }
  if (input.reload && state.gun.cool <= 0 && state.gun.mag < magCap(state) && state.gun.reserve > 0) {
    const take = Math.min(magCap(state) - state.gun.mag, state.gun.reserve);
    state.gun.mag += take;
    state.gun.reserve -= take;
    state.gun.cool = 0.7;
    state.events.push("reload");
  }
  if (input.shoot) tryShoot(state);
  state.glide = Math.max(0, state.glide - stepDt);
  moveDynamics(state, stepDt);

  if (input.jetEdge && state.fuel >= 34) {
    state.fuel -= 34;
    body.vy = Math.max(body.vy, body.grounded ? 11.2 : 8.6);
    body.grounded = false;
    body.groundId = 0;
    body.coyote = 0;
    state.glide = 0.62;
    state.events.push("jet");
  }
  const fly = !!(input.jet && state.glide > 0 && state.fuel > 0);
  if (fly) state.fuel -= 22 * stepDt;
  if (body.grounded && !input.jet) {
    const regen = state.floor >= 5 ? 3.2 : 5;
    state.fuel = Math.min(100, state.fuel + regen * stepDt);
  }
  state.fuel = Math.max(0, state.fuel);

  if (input.spore && state.spores > 0 && state.invis <= 0) {
    state.spores -= 1;
    state.invis = 4.2;
    state.events.push("spore");
  }

  const probeY = body.y + HEIGHT * 0.4;
  const slow = hasKind(state, "moth", body.x, probeY, body.z) ? 0.55 : 1;
  const speed = (input.sprint ? 6.85 : 4.55) * slow;
  const vyBefore = body.vy;
  const groundedBefore = body.grounded;
  const jumped = integrate(body, state.solids, stepDt, {
    wishX: (input.wishX || 0) * speed,
    wishZ: (input.wishZ || 0) * speed,
    jump: !!input.jump,
    fly,
  });
  if (jumped) state.events.push("jump");
  if (!groundedBefore && body.grounded && vyBefore < -4) state.events.push("land");

  senseWorld(state, input, stepDt);
  if (state.status !== "play") return;
  if (input.slap) trySlap(state, input);
  updateWorm(state, stepDt);
  if (state.status !== "play") return;
  updateActors(state, stepDt);
  if (state.status !== "play") return;
  fallCheck(state);
  hints(state);
}
