export const LOOPS = 6;
export const PER_LOOP = 16;
export const STEP_COUNT = LOOPS * PER_LOOP;
export const RISE = 0.46;
export const CORNER = 6.05;
export const CORNER_SIZE = 4.2;
const THICK = RISE - 0.12;

const GAPS = new Set([18, 27, 43, 51, 70, 86]);
const BANANAS = [10, 23, 38, 55, 75, 91];
const MINES = [22, 34, 47, 63, 82, 93];
const CRUMBLE = [29, 45, 68, 88];
const NARROW = new Set([35, 37, 58, 59, 77, 91]);
const BEETLES = [21, 49, 73, 90];
const SLAPPERS = [31, 54, 76, 94];
const MOTHS = [41, 66, 85];
const SPORES = [25, 57, 89];
const COCOONS = [5, 11, 19, 28, 37, 44, 52, 60, 67, 81, 87, 95];
const SAFES = [26, 53, 74];
const MAGMA = new Set([72, 83, 92]);
const BANNERS = [
  [3, "4"],
  [6, "1"],
  [9, "8"],
  [12, "6"],
];
const CHECKPOINTS = [0, 16, 32, 48, 64, 80];
const KEYPAD_STEP = 14;
const LIFT_STEP = 78;
const FAKE_STEP = 39;

const HINTS = [
  { step: 0, id: "move", text: "沿台阶往上。电脑用 WASD 和鼠标。平板和手机用左下摇杆，滑动画面转向，右侧开枪、跳跃。" },
  { step: 4, id: "code", text: "牌子上的数字就是铜盘口令。凑齐四位后，按 E 或点右侧「盘」。" },
  { step: 8, id: "peel", text: "黄皮会把你滑下塔，从旁边绕过去。" },
  { step: 17, id: "gap", text: "缺口要助跑。按住空格，跳得更远。" },
  { step: 19, id: "slap", text: "左键开枪。甲虫和傀儡几枪就倒，塔虫要多打几枪才会退下去。R 换弹。" },
  { step: 25, id: "safe", text: "绿色侧台是安全区。多站一会儿，塔虫会退回下面。" },
  { step: 24, id: "jet", text: "F 是喷气助跳。落地之后油才会慢慢回来。" },
  { step: 26, id: "spore", text: "捡到金孢子后按 Q，可以隐身几秒。" },
  { step: 71, id: "magma", text: "发红的台面会烫伤。踏上去就走，别停。" },
];

let nextId = 1;

function solid(cx, top, cz, w, h, d, mat, extra = {}) {
  return {
    id: nextId++,
    cx,
    cz,
    top,
    w,
    h,
    d,
    mat,
    tag: extra.tag || "step",
    dynamic: !!extra.dynamic,
    disabled: false,
    minX: cx - w / 2,
    maxX: cx + w / 2,
    minY: top - h,
    maxY: top,
    minZ: cz - d / 2,
    maxZ: cz + d / 2,
    homeX: cx,
    homeZ: cz,
    homeTop: top,
    homePhase: extra.phase || 0,
    crumble: !!extra.crumble,
    crumbleT: 0,
    falling: false,
    mover: !!extra.mover,
    amp: extra.amp || 0,
    axis: extra.axis || "x",
    speed: extra.speed || 1,
    phase: extra.phase || 0,
    y0: extra.y0,
    y1: extra.y1,
    dest: null,
    step: extra.step ?? -1,
  };
}

function buildSlots() {
  const half = CORNER_SIZE / 2;
  const span = CORNER * 2 - CORNER_SIZE;
  const tread = span / 3;
  const corners = [
    [-CORNER, CORNER],
    [CORNER, CORNER],
    [CORNER, -CORNER],
    [-CORNER, -CORNER],
  ];
  const slots = [];
  for (let side = 0; side < 4; side++) {
    const [x, z] = corners[side];
    const [nx, nz] = corners[(side + 1) % 4];
    slots.push({ x, z, w: CORNER_SIZE, d: CORNER_SIZE, side, corner: true });
    for (let i = 0; i < 3; i++) {
      if (side % 2 === 0) {
        const dir = nx > x ? 1 : -1;
        const start = x + dir * half;
        slots.push({
          x: start + dir * tread * (i + 0.5),
          z,
          w: tread,
          d: CORNER_SIZE,
          side,
          corner: false,
        });
      } else {
        const dir = nz > z ? 1 : -1;
        const start = z + dir * half;
        slots.push({
          x,
          z: start + dir * tread * (i + 0.5),
          w: CORNER_SIZE,
          d: tread,
          side,
          corner: false,
        });
      }
    }
  }
  if (slots.length !== PER_LOOP) throw new Error("slot count " + slots.length);
  return slots;
}

const SLOTS = buildSlots();

export function pose(index) {
  const slot = SLOTS[index % PER_LOOP];
  return {
    i: index,
    loop: Math.floor(index / PER_LOOP),
    slot: index % PER_LOOP,
    x: slot.x,
    z: slot.z,
    y: index * RISE,
    w: slot.w,
    d: slot.d,
    side: slot.side,
    corner: slot.corner,
  };
}

function outward(p) {
  if (p.side === 0) return { x: 0, z: 1 };
  if (p.side === 1) return { x: 1, z: 0 };
  if (p.side === 2) return { x: 0, z: -1 };
  return { x: -1, z: 0 };
}

function materialFor(index, loop) {
  if (MAGMA.has(index)) return "magma";
  if (CRUMBLE.includes(index)) return "crumble";
  if (loop <= 1) return "wood";
  if (loop <= 3) return "chitin";
  return "ash";
}

function addFaceRail(solids, slot, y, face) {
  const t = 0.18;
  const h = 0.92;
  const top = y + h;
  if (face === "+z") solids.push(solid(slot.x, top, slot.z + slot.d / 2 - t / 2, slot.w, h, t, "rail", { tag: "rail" }));
  else if (face === "-z") solids.push(solid(slot.x, top, slot.z - slot.d / 2 + t / 2, slot.w, h, t, "rail", { tag: "rail" }));
  else if (face === "+x") solids.push(solid(slot.x + slot.w / 2 - t / 2, top, slot.z, t, h, slot.d, "rail", { tag: "rail" }));
  else if (face === "-x") solids.push(solid(slot.x - slot.w / 2 + t / 2, top, slot.z, t, h, slot.d, "rail", { tag: "rail" }));
}

function railsFor(solids, p) {
  const faces = [];
  if (p.corner) {
    if (p.side === 0) faces.push("-x", "+z");
    else if (p.side === 1) faces.push("+x", "+z");
    else if (p.side === 2) faces.push("+x", "-z");
    else faces.push("-x", "-z");
  } else if (p.side === 0) faces.push("+z");
  else if (p.side === 1) faces.push("+x");
  else if (p.side === 2) faces.push("-z");
  else faces.push("-x");
  for (let i = 0; i < faces.length; i++) addFaceRail(solids, p, p.y, faces[i]);
}

function trigger(kind, x, y, z, r, extra = {}) {
  return { id: extra.id || kind + ":" + (extra.step ?? nextId++), kind, x, y, z, r, ...extra };
}

function useIndex(index, label) {
  if (index < 0 || index >= STEP_COUNT) throw new Error(label + " out of range " + index);
  if (GAPS.has(index)) throw new Error(label + " sits on a gap at " + index);
}

export function buildLevel(options = {}) {
  const gaps = options.gaps !== false;
  const solids = [];
  const visuals = [];
  const triggers = [];
  const actors = [];
  const route = [];
  const banners = [];

  for (let i = 0; i < STEP_COUNT; i++) {
    const p = pose(i);
    if (gaps && GAPS.has(i)) continue;
    let w = p.w;
    let d = p.d;
    if (NARROW.has(i)) {
      if (p.side % 2 === 0) d = 2.15;
      else w = 2.15;
    }
    solids.push(
      solid(p.x, p.y, p.z, w, THICK, d, materialFor(i, p.loop), {
        tag: "step",
        step: i,
        crumble: CRUMBLE.includes(i),
        dynamic: CRUMBLE.includes(i),
      }),
    );
    route.push({ x: p.x, y: p.y, z: p.z, step: i });
    if (p.loop === 0 && i !== KEYPAD_STEP) railsFor(solids, { ...p, w, d });
  }

  for (const i of BANANAS) {
    useIndex(i, "banana");
    const p = pose(i);
    triggers.push(trigger("banana", p.x, p.y, p.z, 0.72, { step: i }));
  }
  for (const i of MINES) {
    useIndex(i, "mine");
    const p = pose(i);
    const o = outward(p);
    triggers.push(trigger("mine", p.x - o.x * 0.85, p.y, p.z - o.z * 0.85, 0.62, { step: i }));
  }
  for (const i of COCOONS) {
    useIndex(i, "cocoon");
    const p = pose(i);
    const o = outward(p);
    triggers.push(trigger("cocoon", p.x + o.x * 1.15, p.y + 0.7, p.z + o.z * 1.15, 0.7, { step: i }));
  }
  for (const i of SPORES) {
    useIndex(i, "spore");
    const p = pose(i);
    triggers.push(trigger("spore", p.x, p.y + 0.8, p.z, 0.7, { step: i }));
  }
  for (const i of MOTHS) {
    useIndex(i, "moth");
    const p = pose(i);
    triggers.push(trigger("moth", p.x, p.y + 0.8, p.z, 1.7, { step: i }));
  }
  for (const i of CHECKPOINTS) {
    useIndex(i, "checkpoint");
    const p = pose(i);
    triggers.push(trigger("checkpoint", p.x, p.y, p.z, 1.35, { step: i }));
  }
  MAGMA.forEach((i) => {
    useIndex(i, "magma");
    const p = pose(i);
    triggers.push(trigger("magma", p.x, p.y + 0.4, p.z, Math.min(p.w, p.d) * 0.42, { step: i }));
  });

  for (const i of SAFES) {
    useIndex(i, "safe");
    const p = pose(i);
    const o = outward(p);
    const size = 2.35;
    const radial = p.side % 2 === 0 ? p.d / 2 : p.w / 2;
    const ax = p.x + o.x * (radial + size / 2 - 0.45);
    const az = p.z + o.z * (radial + size / 2 - 0.45);
    solids.push(solid(ax, p.y, az, size, THICK, size, "safe", { tag: "alcove", step: i }));
    const alongX = Math.abs(o.x) >= Math.abs(o.z);
    solids.push(
      solid(ax + o.x * 1.55, p.y + 0.85, az + o.z * 1.55, alongX ? 0.18 : 3.3, 0.85, alongX ? 3.3 : 0.18, "rail", {
        tag: "rail",
      }),
    );
    triggers.push(trigger("safe", ax, p.y + 0.6, az, 1.2, { step: i }));
  }

  for (const [i, text] of BANNERS) {
    useIndex(i, "banner");
    const p = pose(i);
    const o = outward(p);
    banners.push({ x: p.x + o.x * 2.35, y: p.y + 1.7, z: p.z + o.z * 2.35, text, step: i });
  }

  for (let n = 0; n < BEETLES.length; n++) {
    const i = BEETLES[n];
    useIndex(i, "beetle");
    const p = pose(i);
    actors.push(actor("beetle", i, p, n));
  }
  for (const i of SLAPPERS) {
    useIndex(i, "slapper");
    actors.push(actor("slapper", i, pose(i), 0));
  }

  const pad = pose(KEYPAD_STEP);
  const padOut = outward(pad);
  const liftReach = 5.05;
  const liftX = pad.x + padOut.x * liftReach;
  const liftZ = pad.z + padOut.z * liftReach;
  const dest = pose(LIFT_STEP);
  solids.push(
    solid((pad.x + liftX) / 2, pad.y, (pad.z + liftZ) / 2, Math.max(2.2, Math.abs(liftX - pad.x)), THICK, Math.max(2.2, Math.abs(liftZ - pad.z)), "wood", {
      tag: "porch",
      step: KEYPAD_STEP,
    }),
  );
  const liftHalf = 1.4;
  solids.push(
    solid(liftX, pad.y, liftZ, liftHalf * 2, 0.28, liftHalf * 2, "lift", {
      tag: "lift",
      dynamic: true,
      step: KEYPAD_STEP,
      y0: pad.y,
      y1: dest.y,
      speed: 3.6,
    }),
  );
  const lip = 0.5;
  const meetX = liftX - padOut.x * (liftHalf - lip);
  const meetZ = liftZ - padOut.z * (liftHalf - lip);
  solids.push(
    solid((dest.x + meetX) / 2, dest.y, (dest.z + meetZ) / 2, Math.max(2.2, Math.abs(meetX - dest.x)), THICK, Math.max(2.2, Math.abs(meetZ - dest.z)), "wood", {
      tag: "porch",
      step: LIFT_STEP,
    }),
  );
  const keypad = { x: liftX, y: pad.y, z: liftZ, step: KEYPAD_STEP };

  const mid = pose(48);
  solids.push(
    solid(0, mid.y, 0, 2.5, 0.28, 2.5, "lift", {
      tag: "mover",
      dynamic: true,
      mover: true,
      amp: 3.15,
      axis: "x",
      speed: 0.85,
      phase: 0,
      step: 48,
    }),
  );
  triggers.push(trigger("cocoon", 0, mid.y + 0.8, 0, 0.8, { step: 48, id: "cocoon:shaft" }));

  const fake = pose(FAKE_STEP);
  const fakeOut = outward(fake);
  visuals.push({
    x: fake.x + fakeOut.x * 3.45,
    y: fake.y,
    z: fake.z + fakeOut.z * 3.45,
    w: 2.15,
    h: THICK,
    d: 2.15,
    mat: "fake",
  });

  const last = pose(STEP_COUNT - 1);
  const lastOut = outward(last);
  const stepAlong = last.side % 2 === 0 ? last.w : last.d;
  const stepRadial = last.side % 2 === 0 ? last.d : last.w;
  const wide = 3.3;
  const slim = Math.min(stepAlong - 0.25, 2.15);
  const goalW = Math.abs(lastOut.x) > 0.5 ? wide : slim;
  const goalD = Math.abs(lastOut.z) > 0.5 ? wide : slim;
  const reach = stepRadial / 2 + wide / 2 - 0.5;
  const goalX = last.x + lastOut.x * reach;
  const goalZ = last.z + lastOut.z * reach;
  solids.push(solid(goalX, last.y, goalZ, goalW, THICK, goalD, "roof", { tag: "goalpad", step: STEP_COUNT - 1 }));
  solids.push(
    solid(
      goalX + lastOut.x * (wide / 2 - 0.1),
      last.y + 0.85,
      goalZ + lastOut.z * (wide / 2 - 0.1),
      Math.abs(lastOut.x) > 0.5 ? 0.18 : slim,
      0.85,
      Math.abs(lastOut.z) > 0.5 ? 0.18 : slim,
      "rail",
      { tag: "rail" },
    ),
  );
  triggers.push(trigger("goal", goalX, last.y + 0.6, goalZ, 1.35, { step: STEP_COUNT - 1 }));
  route.push({ x: goalX, y: last.y, z: goalZ, step: STEP_COUNT });

  const spawn = pose(0);
  return {
    solids,
    visuals,
    triggers,
    actors,
    banners,
    route,
    hints: HINTS,
    spawn: { x: spawn.x, y: spawn.y, z: spawn.z, yaw: -Math.PI / 2 },
    keypad,
    code: "4186",
    loops: LOOPS,
    stepCount: STEP_COUNT,
    rise: RISE,
    goal: { x: goalX, y: last.y, z: goalZ },
  };
}

function actor(kind, step, p, phase) {
  return {
    id: kind + "-" + step,
    kind,
    x: p.x,
    y: p.y,
    z: p.z,
    homeX: p.x,
    homeY: p.y,
    homeZ: p.z,
    vx: 0,
    vy: 0,
    vz: 0,
    alive: true,
    hp: kind === "beetle" ? 36 : 54,
    maxHp: kind === "beetle" ? 36 : 54,
    falling: false,
    grounded: true,
    stun: 0,
    phase,
    along: p.side % 2 === 0 ? 0 : Math.PI / 2,
    state: "idle",
    timer: 0,
    step,
  };
}
