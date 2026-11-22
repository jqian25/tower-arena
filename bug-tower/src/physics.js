export const RADIUS = 0.34;
export const HEIGHT = 1.4;
export const STEP_UP = 0.64;

export function makeBody(x, y, z) {
  return {
    x,
    y,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    grounded: false,
    groundId: 0,
    coyote: 0,
    jumpBuf: 0,
    slide: 0,
  };
}

export function moveSolid(solid, cx, top, cz) {
  solid.cx = cx;
  solid.cz = cz;
  solid.top = top;
  solid.minX = cx - solid.w / 2;
  solid.maxX = cx + solid.w / 2;
  solid.minY = top - solid.h;
  solid.maxY = top;
  solid.minZ = cz - solid.d / 2;
  solid.maxZ = cz + solid.d / 2;
}

function hitsCircle(x, z, radius, box) {
  const cx = clamp(x, box.minX, box.maxX);
  const cz = clamp(z, box.minZ, box.maxZ);
  const dx = x - cx;
  const dz = z - cz;
  return dx * dx + dz * dz < radius * radius;
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

export function findGround(x, y, z, solids, reach) {
  let best = null;
  const foot = RADIUS * 0.72;
  for (let i = 0; i < solids.length; i++) {
    const box = solids[i];
    if (box.disabled) continue;
    if (box.maxY > y + 0.08) continue;
    if (y - box.maxY > reach) continue;
    if (!hitsCircle(x, z, foot, box)) continue;
    if (!best || box.maxY > best.y) best = { y: box.maxY, id: box.id };
  }
  return best;
}

export function bodyOverlaps(x, y, z, solids) {
  const y0 = y + 0.08;
  const y1 = y + HEIGHT;
  for (let i = 0; i < solids.length; i++) {
    const box = solids[i];
    if (box.disabled) continue;
    if (y1 <= box.minY || y0 >= box.maxY) continue;
    if (hitsCircle(x, z, RADIUS, box)) return true;
  }
  return false;
}

function tryHorizontal(body, solids, dx, dz) {
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-8) return;
  const steps = Math.max(1, Math.ceil(dist / 0.18));
  const sx = dx / steps;
  const sz = dz / steps;
  for (let i = 0; i < steps; i++) {
    const nx = body.x + sx;
    const nz = body.z + sz;
    if (!bodyOverlaps(nx, body.y, nz, solids)) {
      body.x = nx;
      body.z = nz;
      continue;
    }
    let stepped = false;
    const probes = [0.28, 0.48, STEP_UP];
    for (let p = 0; p < probes.length; p++) {
      const h = probes[p];
      if (bodyOverlaps(nx, body.y + h, nz, solids)) continue;
      const ground = findGround(nx, body.y + h, nz, solids, h + 0.08);
      if (!ground) continue;
      if (ground.y < body.y - 0.04 || ground.y > body.y + STEP_UP + 0.02) continue;
      body.x = nx;
      body.y = ground.y;
      body.z = nz;
      body.grounded = true;
      body.groundId = ground.id;
      stepped = true;
      break;
    }
    if (stepped) continue;
    if (!bodyOverlaps(nx, body.y, body.z, solids)) body.x = nx;
    else if (!bodyOverlaps(body.x, body.y, nz, solids)) body.z = nz;
  }
}

function tryVertical(body, solids, dy) {
  if (dy >= -1e-8) {
    if (dy <= 1e-8) return;
    const steps = Math.max(1, Math.ceil(dy / 0.1));
    const sy = dy / steps;
    for (let i = 0; i < steps; i++) {
      const ny = body.y + sy;
      if (bodyOverlaps(body.x, ny, body.z, solids)) {
        body.vy = Math.min(body.vy, 0);
        return;
      }
      body.y = ny;
    }
    body.grounded = false;
    body.groundId = 0;
    return;
  }

  const steps = Math.max(1, Math.ceil(-dy / 0.1));
  const sy = dy / steps;
  for (let i = 0; i < steps; i++) {
    const ny = body.y + sy;
    const ground = findGround(body.x, body.y, body.z, solids, body.y - ny + 0.04);
    if (ground && ground.y <= body.y + 0.02 && ground.y >= ny - 0.001) {
      body.y = ground.y;
      body.vy = 0;
      body.grounded = true;
      body.groundId = ground.id;
      return;
    }
    if (bodyOverlaps(body.x, ny, body.z, solids)) {
      const snap = findGround(body.x, body.y + 0.2, body.z, solids, 0.9);
      if (snap) {
        body.y = snap.y;
        body.grounded = true;
        body.groundId = snap.id;
      }
      body.vy = 0;
      return;
    }
    body.y = ny;
    body.grounded = false;
    body.groundId = 0;
  }
}

function once(body, solids, dt, control) {
  if (body.grounded) body.coyote = 0.12;
  else body.coyote -= dt;

  if (control.jump) body.jumpBuf = 0.12;
  else body.jumpBuf -= dt;

  let jumped = false;
  if (body.jumpBuf > 0 && (body.grounded || body.coyote > 0)) {
    body.vy = 8.9;
    body.grounded = false;
    body.groundId = 0;
    body.coyote = 0;
    body.jumpBuf = 0;
    jumped = true;
  }

  const gravity = control.fly ? 10 : !control.jump && body.vy > 0 ? 50 : 32;
  body.vy = Math.max(-30, body.vy - gravity * dt);

  const wishX = control.wishX;
  const wishZ = control.wishZ;
  const sliding = body.slide > 0;
  if (sliding) body.slide -= dt;
  const wishSpeed = Math.hypot(wishX, wishZ);
  if (body.grounded && !control.fly && (wishSpeed < 0.2 || sliding)) {
    const speed = Math.hypot(body.vx, body.vz);
    const friction = sliding ? 2.4 : 14;
    if (speed > 0) {
      const drop = Math.min(speed, friction * dt * (sliding ? 1 : 8));
      const scale = (speed - drop) / speed;
      body.vx *= scale;
      body.vz *= scale;
    }
  }

  const accel = sliding ? 6 : body.grounded ? 96 : 20;
  const dx = wishX - body.vx;
  const dz = wishZ - body.vz;
  const delta = Math.hypot(dx, dz);
  if (delta > 1e-5) {
    const scale = Math.min(accel * dt, delta) / delta;
    body.vx += dx * scale;
    body.vz += dz * scale;
  }

  const cap = sliding ? 12 : 14;
  const planar = Math.hypot(body.vx, body.vz);
  if (planar > cap) {
    body.vx = (body.vx / planar) * cap;
    body.vz = (body.vz / planar) * cap;
  }

  tryHorizontal(body, solids, body.vx * dt, body.vz * dt);
  tryVertical(body, solids, body.vy * dt);

  if (body.vy <= 0) {
    const ground = findGround(body.x, body.y, body.z, solids, 0.16);
    if (ground && body.y - ground.y <= 0.16 && body.y - ground.y >= -0.02) {
      body.y = ground.y;
      body.vy = 0;
      body.grounded = true;
      body.groundId = ground.id;
    }
  }

  return jumped;
}

export function integrate(body, solids, dt, control = {}) {
  const wishX = control.wishX || 0;
  const wishZ = control.wishZ || 0;
  const stepControl = {
    wishX,
    wishZ,
    jump: !!control.jump,
    fly: !!control.fly,
  };
  const n = Math.max(1, Math.ceil(dt / (1 / 90)));
  const h = dt / n;
  let jumped = false;
  for (let i = 0; i < n; i++) {
    if (once(body, solids, h, stepControl)) jumped = true;
  }
  return jumped;
}
