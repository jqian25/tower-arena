import assert from "node:assert/strict";
import test from "node:test";
import { buildLevel, pose } from "../src/level.js";
import { integrate, makeBody } from "../src/physics.js";
import { beginRun, createState, submitCode, update } from "../src/sim.js";

const NONE = { wishX: 0, wishZ: 0, facingX: 1, facingZ: 0 };

function solid(cx, top, cz, w, h, d, mat) {
  return {
    id: mat + cx + cz,
    cx, cz, top, w, h, d, mat, tag: "step", disabled: false,
    minX: cx - w / 2, maxX: cx + w / 2, minY: top - h, maxY: top, minZ: cz - d / 2, maxZ: cz + d / 2,
  };
}

function overlapArea(a, b) {
  const ox = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const oz = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
  if (ox <= 0.04 || oz <= 0.04) return 0;
  return ox * oz;
}

test("stands on a platform", () => {
  const floor = solid(0, 0, 0, 6, 0.5, 6, "wood");
  const body = makeBody(0, 0, 0);
  for (let i = 0; i < 90; i++) integrate(body, [floor], 1 / 60, NONE);
  assert.equal(body.grounded, true);
  assert.ok(Math.abs(body.y) < 0.02, "y=" + body.y);
});

test("wall stops a sprint", () => {
  const floor = solid(0, 0, 0, 10, 0.5, 8, "wood");
  const wall = solid(2, 1.2, 0, 0.4, 1.2, 4, "rail");
  const body = makeBody(0, 0, 0);
  for (let i = 0; i < 180; i++) integrate(body, [floor, wall], 1 / 60, { wishX: 6.5, wishZ: 0, jump: false });
  assert.ok(body.x < 1.7, "x=" + body.x);
  assert.ok(body.y < 0.2, "climbed the wall y=" + body.y);
});

test("steps up a riser", () => {
  const lower = solid(-1.2, 0, 0, 2.4, 0.34, 3, "wood");
  const upper = solid(1.2, 0.46, 0, 2.4, 0.34, 3, "wood");
  const body = makeBody(-1.2, 0, 0);
  let peaked = false;
  for (let i = 0; i < 180; i++) {
    integrate(body, [lower, upper], 1 / 60, { wishX: 6.6, wishZ: 0, jump: false });
    if (body.y > 0.4 && body.x > 0.2 && body.x < 2.3) peaked = true;
  }
  assert.equal(peaked, true, `y=${body.y} x=${body.x}`);
});

test("sprint jump clears a tread gap", () => {
  const left = solid(-2.1, 0, 0, 3, 0.4, 3, "wood");
  const right = solid(3.5, 0, 0, 3, 0.4, 3, "wood");
  const body = makeBody(-2.1, 0, 0);
  let landed = false;
  for (let i = 0; i < 240; i++) {
    const jump = body.x > -1.15 && body.y < 0.2;
    integrate(body, [left, right], 1 / 60, { wishX: 6.8, wishZ: 0, jump, sprint: true });
    if (body.x > 2.2 && body.grounded && body.y > -0.05) landed = true;
  }
  assert.equal(landed, true, `x=${body.x} y=${body.y} grounded=${body.grounded}`);
});

test("tower steps do not form ceilings", () => {
  const level = buildLevel();
  const problems = [];
  const solids = level.solids;
  for (let i = 0; i < solids.length; i++) {
    for (let j = i + 1; j < solids.length; j++) {
      const a = solids[i];
      const b = solids[j];
      if (a.tag === "rail" || b.tag === "rail") continue;
      const dy = Math.abs(a.maxY - b.maxY);
      const area = overlapArea(a, b);
      if (area > 0.05 && dy > 0.05 && dy < 3) {
        problems.push(`${a.tag}#${a.step} overlaps ${b.tag}#${b.step} dy=${dy.toFixed(2)} area=${area.toFixed(2)}`);
      }
    }
  }
  assert.deepEqual(problems, []);
});

test("content matches the tower", () => {
  const level = buildLevel();
  const count = (kind) => level.triggers.filter((trigger) => trigger.kind === kind).length;
  assert.ok(count("banana") >= 5);
  assert.ok(count("mine") >= 5);
  assert.ok(count("safe") >= 3);
  assert.ok(count("checkpoint") >= 6);
  assert.ok(count("cocoon") >= 12);
  assert.equal(level.actors.filter((actor) => actor.kind === "beetle").length, 4);
  assert.equal(level.actors.filter((actor) => actor.kind === "slapper").length, 4);
  assert.equal(level.code, "4186");
  assert.equal(level.banners.map((banner) => banner.text).join(""), "4186");
  assert.ok(level.solids.some((box) => box.tag === "lift"));
  assert.equal(count("goal"), 1);
  assert.equal(pose(0).y, 0);
});

test("bot climbs the whole spiral", () => {
  const level = buildLevel({ gaps: false });
  const body = makeBody(level.spawn.x, level.spawn.y, level.spawn.z);
  const route = level.route;
  let index = 0;
  let stuck = 0;
  let lastX = body.x;
  let lastZ = body.z;
  const dt = 1 / 60;
  for (let frame = 0; frame < 60 * 100 && index < route.length; frame++) {
    const target = route[index];
    const dx = target.x - body.x;
    const dz = target.z - body.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.62 && body.y >= target.y - 0.25) {
      index += 1;
      stuck = 0;
      continue;
    }
    integrate(body, level.solids, dt, { wishX: (dx / (dist || 1)) * 6.7, wishZ: (dz / (dist || 1)) * 6.7, jump: false });
    if (Math.hypot(body.x - lastX, body.z - lastZ) < 0.01 && Math.abs(body.y - target.y) > 0.2) stuck += 1;
    else stuck = 0;
    lastX = body.x;
    lastZ = body.z;
    if (body.y < -1) assert.fail(`fell at step ${index} pos ${body.x.toFixed(2)},${body.y.toFixed(2)},${body.z.toFixed(2)}`);
    if (stuck > 150) {
      assert.fail(`stuck at ${body.x.toFixed(2)},${body.y.toFixed(2)},${body.z.toFixed(2)} -> ${target.x.toFixed(2)},${target.y.toFixed(2)},${target.z.toFixed(2)} index ${index}/${route.length}`);
    }
  }
  assert.equal(index, route.length);
  assert.ok(body.y > level.goal.y - 0.2);
});

test("lunge eats a still player and misses a sidestep", () => {
  const level = buildLevel({ gaps: false });
  const spot = level.route[24];
  const still = beginRun(level);
  still.grace = 0;
  still.iframe = 0;
  still.body.x = spot.x;
  still.body.y = spot.y;
  still.body.z = spot.z;
  still.worm.phase = "lunge";
  still.worm.timer = 0.36;
  still.worm.fromX = 0;
  still.worm.fromZ = 0;
  still.worm.fromY = spot.y - 1;
  still.worm.toX = spot.x;
  still.worm.toZ = spot.z;
  still.worm.toY = spot.y;
  for (let i = 0; i < 40 && still.status === "play"; i++) update(still, 1 / 60, NONE);
  assert.equal(still.status, "dead");
  assert.equal(still.deathReason, "eaten");

  const dodge = beginRun(level);
  dodge.grace = 0;
  dodge.iframe = 0;
  dodge.body.x = spot.x;
  dodge.body.y = spot.y;
  dodge.body.z = spot.z + 4.5;
  dodge.worm.phase = "lunge";
  dodge.worm.timer = 0.36;
  dodge.worm.fromX = 0;
  dodge.worm.fromZ = 0;
  dodge.worm.fromY = spot.y - 1;
  dodge.worm.toX = spot.x;
  dodge.worm.toZ = spot.z;
  dodge.worm.toY = spot.y;
  for (let i = 0; i < 40; i++) update(dodge, 1 / 60, NONE);
  assert.equal(dodge.status, "play");
});

test("safe alcove cancels a bite", () => {
  const level = buildLevel();
  const state = beginRun(level);
  state.grace = 0;
  state.iframe = 0;
  const safe = level.triggers.find((trigger) => trigger.kind === "safe");
  state.body.x = safe.x;
  state.body.y = safe.y;
  state.body.z = safe.z;
  state.worm.phase = "windup";
  state.worm.timer = 0.4;
  state.worm.windupDur = 0.7;
  state.worm.y = safe.y;
  update(state, 1 / 30, NONE);
  assert.equal(state.safe, true);
  assert.equal(state.worm.phase, "recover");
});

test("checkpoint, magma, banana, slap and keypad", () => {
  const level = buildLevel();
  const state = beginRun(level);
  state.grace = 99;
  state.iframe = 0;
  state.worm.y = -40;
  const cp = level.triggers.find((trigger) => trigger.kind === "checkpoint" && trigger.step === 16);
  state.body.x = cp.x;
  state.body.y = cp.y;
  state.body.z = cp.z;
  state.body.grounded = true;
  update(state, 1 / 60, NONE);
  assert.ok(state.cp.y > 1);

  const magma = level.triggers.find((trigger) => trigger.kind === "magma");
  const burning = beginRun(level);
  burning.grace = 99;
  burning.worm.y = -40;
  burning.body.x = magma.x;
  burning.body.y = magma.y;
  burning.body.z = magma.z;
  burning.body.grounded = true;
  for (let i = 0; i < 50 && burning.status === "play"; i++) update(burning, 1 / 30, NONE);
  assert.equal(burning.deathReason, "magma");

  const peel = level.triggers.find((trigger) => trigger.kind === "banana");
  const slider = beginRun(level);
  slider.grace = 99;
  slider.worm.y = -40;
  slider.body.x = peel.x;
  slider.body.y = peel.y;
  slider.body.z = peel.z;
  slider.body.vx = 4;
  update(slider, 1 / 60, { ...NONE, facingX: 1, facingZ: 0 });
  assert.ok(slider.body.slide > 0.4, "slide=" + slider.body.slide);

  const beetle = level.actors.find((actor) => actor.kind === "beetle");
  const fighter = beginRun(level);
  fighter.grace = 99;
  fighter.worm.y = -40;
  fighter.body.x = beetle.x - 1.2;
  fighter.body.y = beetle.y;
  fighter.body.z = beetle.z;
  fighter.body.grounded = true;
  update(fighter, 1 / 60, { wishX: 0, wishZ: 0, facingX: 1, facingZ: 0, slap: true });
  const slapped = fighter.actors.find((actor) => actor.id === beetle.id);
  assert.equal(slapped.falling, true);
  assert.ok(slapped.vy > 4);

  const coder = beginRun(level);
  assert.equal(submitCode(coder, "0000"), false);
  assert.equal(submitCode(coder, "4186"), true);
  const lift = coder.solids.find((box) => box.tag === "lift");
  assert.equal(lift.dest, "up");
  const before = lift.top;
  for (let i = 0; i < 90; i++) update(coder, 1 / 30, NONE);
  assert.ok(lift.top > before + 2, "lift y " + lift.top);
});

test("rifle drops a beetle standing ahead", () => {
  const level = buildLevel({ gaps: false });
  const state = beginRun(level);
  state.grace = 99;
  state.iframe = 0;
  state.worm.y = -40;
  const beetle = state.actors.find((actor) => actor.kind === "beetle");
  state.body.x = beetle.x - 4;
  state.body.y = beetle.y;
  state.body.z = beetle.z;
  state.yaw = -Math.PI / 2;
  state.pitch = 0;
  const before = beetle.hp;
  update(state, 1 / 60, { wishX: 0, wishZ: 0, facingX: 1, facingZ: 0, shoot: true });
  const after = state.actors.find((actor) => actor.id === beetle.id);
  assert.ok(after.hp < before, "hp " + after.hp);
});

test("fresh state starts at the door", () => {
  const state = createState(buildLevel());
  assert.equal(state.status, "menu");
  assert.equal(state.body.y, 0);
  assert.equal(state.cocoons, 0);
});
