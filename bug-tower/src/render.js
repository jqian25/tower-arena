import * as THREE from "three";
import { Sky } from "../vendor/Sky.js";
import { CORNER, RISE, STEP_COUNT } from "./level.js";

function canvasTexture(paint, w, h) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  paint(canvas.getContext("2d"), w, h);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

function woodTexture() {
  return canvasTexture((g, w, h) => {
    g.fillStyle = "#4a3020";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 14; i++) {
      g.strokeStyle = `rgba(32,16,8,${0.18 + (i % 3) * 0.08})`;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(0, i * 10 + 4);
      g.bezierCurveTo(40, i * 10, 80, i * 10 + 12, w, i * 10 + 2);
      g.stroke();
    }
  }, 128, 128);
}

function makeMaterials() {
  const woodMap = woodTexture();
  const standard = (color, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.86, metalness: 0.04, ...extra });
  return {
    wood: standard("#4a3020", { map: woodMap }),
    chitin: standard("#3a2438"),
    ash: standard("#3e444a"),
    magma: standard("#7a2218", { emissive: "#4a100c", emissiveIntensity: 0.4, roughness: 0.62 }),
    crumble: standard("#3a2818", { map: woodMap }),
    rail: standard("#14110e", { roughness: 0.95 }),
    safe: standard("#1a5c32", { emissive: "#0c3a20", emissiveIntensity: 0.35 }),
    roof: standard("#5c4030", { emissive: "#2a180c", emissiveIntensity: 0.08, roughness: 0.7 }),
    lift: standard("#3e2a18", { emissive: "#1a1008", emissiveIntensity: 0.08 }),
    fake: standard("#5a2420", { emissive: "#2a0c0c", emissiveIntensity: 0.08 }),
  };
}

function mergeBoxes(entries) {
  const base = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  const position = base.attributes.position.array;
  const normal = base.attributes.normal.array;
  const uv = base.attributes.uv.array;
  const positions = [];
  const normals = [];
  const uvs = [];
  for (let n = 0; n < entries.length; n++) {
    const box = entries[n];
    const cx = (box.minX + box.maxX) / 2;
    const cy = (box.minY + box.maxY) / 2;
    const cz = (box.minZ + box.maxZ) / 2;
    for (let i = 0; i < position.length; i += 3) {
      positions.push(position[i] * box.w + cx, position[i + 1] * box.h + cy, position[i + 2] * box.d + cz);
      normals.push(normal[i], normal[i + 1], normal[i + 2]);
    }
    for (let i = 0; i < uv.length; i += 2) uvs.push(uv[i] * box.w, uv[i + 1] * box.h);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  return geometry;
}

function labelSprite(text, fill) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const g = canvas.getContext("2d");
  g.fillStyle = "rgba(18,10,8,0.82)";
  g.fillRect(8, 16, 240, 96);
  g.strokeStyle = "#e0b15a";
  g.lineWidth = 6;
  g.strokeRect(8, 16, 240, 96);
  g.fillStyle = fill || "#f4e2c4";
  g.font = '700 78px "WenQuanYi Micro Hei", sans-serif';
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 128, 66);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
  sprite.scale.set(1.8, 0.9, 1);
  return sprite;
}

function buildPlayer() {
  const group = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color: "#6d8eae", roughness: 0.72 });
  const skin = new THREE.MeshStandardMaterial({ color: "#e4c2a4", roughness: 0.7 });
  const scarf = new THREE.MeshStandardMaterial({ color: "#c24b3a", roughness: 0.6 });
  const gloveMat = new THREE.MeshStandardMaterial({ color: "#d9d3c7", roughness: 0.45 });
  const lampMat = new THREE.MeshStandardMaterial({
    color: "#ffc56a",
    emissive: "#ff9a32",
    emissiveIntensity: 0.9,
    roughness: 0.35,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.26), cloth);
  body.position.y = 0.78;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 12), skin);
  head.position.y = 1.18;
  addHumanFace(head, 0.16);
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10, 0, Math.PI * 2, 0, Math.PI / 1.7), cloth);
  hood.position.y = 1.2;
  const wrap = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.28), scarf);
  wrap.position.y = 1.02;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.14), cloth);
  const legR = legL.clone();
  legL.position.set(-0.1, 0.28, 0);
  legR.position.set(0.1, 0.28, 0);
  const glove = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), gloveMat);
  glove.position.set(0.28, 0.78, 0.12);
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.46, 6), cloth);
  stick.position.set(-0.28, 0.92, 0.08);
  stick.rotation.z = 0.4;
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), lampMat);
  lamp.position.set(-0.36, 1.12, 0.12);
  const rifle = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.08, 0.46),
    new THREE.MeshStandardMaterial({ color: "#2c333c", metalness: 0.45, roughness: 0.4 }),
  );
  rifle.position.set(0.32, 0.72, 0.28);
  group.add(body, head, hood, wrap, legL, legR, glove, stick, lamp, rifle);
  group.userData.glove = glove;
  group.userData.legs = [legL, legR];
  return group;
}

function buildBeetle() {
  const group = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({ color: "#6d3d28", roughness: 0.55, metalness: 0.08 });
  const belly = new THREE.MeshStandardMaterial({ color: "#c48464", roughness: 0.7 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 10), shell);
  body.scale.set(1.25, 0.72, 0.95);
  body.position.y = 0.38;
  const under = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), belly);
  under.position.y = 0.24;
  under.scale.set(1, 0.45, 0.8);
  group.add(body, under);
  addBugFace(group);
  return group;
}

function buildSlapper() {
  const group = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color: "#7a2430", roughness: 0.75 });
  const skin = new THREE.MeshStandardMaterial({ color: "#d7b094", roughness: 0.7 });
  const gloveMat = new THREE.MeshStandardMaterial({ color: "#f0ece4", roughness: 0.4 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.62, 0.32), cloth);
  body.position.y = 0.86;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), skin);
  head.position.y = 1.32;
  addHumanFace(head, 0.18);
  const glove = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), gloveMat);
  glove.scale.set(1.3, 0.85, 1.15);
  glove.position.set(0.34, 0.9, 0.2);
  group.add(body, head, glove);
  group.userData.glove = glove;
  return group;
}

function buildWorm() {
  const group = new THREE.Group();
  const hide = new THREE.MeshStandardMaterial({ color: "#c46a48", roughness: 0.48, metalness: 0.06 });
  const belly = new THREE.MeshStandardMaterial({ color: "#f0b79a", roughness: 0.55 });
  const segments = [];
  for (let i = 0; i < 16; i++) {
    const radius = i === 0 ? 0.62 : Math.max(0.22, 0.48 - i * 0.016);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 14, 10), i % 2 === 0 ? hide : belly);
    group.add(mesh);
    segments.push(mesh);
  }
  const mouth = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 12, 10),
    new THREE.MeshStandardMaterial({ color: "#1a0608", roughness: 0.8, emissive: "#3a0808", emissiveIntensity: 0.4 }),
  );
  segments[0].add(mouth);
  mouth.position.z = 0.34;
  addBugFace(segments[0], 0.42, 0.22);
  const toothMat = new THREE.MeshStandardMaterial({ color: "#f2efe6", roughness: 0.35 });
  for (let i = 0; i < 6; i++) {
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 5), toothMat);
    const ang = (i / 6) * Math.PI * 2;
    tooth.position.set(Math.cos(ang) * 0.18, Math.sin(ang) * 0.18, 0.42);
    tooth.rotation.x = Math.PI / 2;
    mouth.add(tooth);
  }
  group.userData.segments = segments;
  group.userData.mouth = mouth;
  return group;
}

function addHumanFace(head, z) {
  const white = new THREE.MeshStandardMaterial({ color: "#fffdf8" });
  const pupil = new THREE.MeshStandardMaterial({ color: "#1a1a1a" });
  const brow = new THREE.MeshStandardMaterial({ color: "#4a3428" });
  const nose = new THREE.MeshStandardMaterial({ color: "#e4b48e" });
  const mouth = new THREE.MeshStandardMaterial({ color: "#c45b62" });
  const eye = (x) => {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), white);
    ball.position.set(x, 0.04, z);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), pupil);
    dot.position.set(x, 0.04, z + 0.03);
    const browMesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.018, 0.02), brow);
    browMesh.position.set(x, 0.1, z);
    head.add(ball, dot, browMesh);
  };
  eye(-0.07);
  eye(0.07);
  const noseMesh = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.05, 0.04), nose);
  noseMesh.position.set(0, -0.01, z);
  const mouthMesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.025), mouth);
  mouthMesh.position.set(0, -0.08, z);
  head.add(noseMesh, mouthMesh);
}

function addBugFace(parent, z = 0.34, y = 0.5) {
  const white = new THREE.MeshStandardMaterial({ color: "#f3fff0" });
  const pupil = new THREE.MeshStandardMaterial({ color: "#142014" });
  const nose = new THREE.MeshStandardMaterial({ color: "#d7e07a" });
  const mouth = new THREE.MeshStandardMaterial({ color: "#8d3040" });
  const eye = (x) => {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), white);
    ball.position.set(x, y, z);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 8), pupil);
    dot.position.set(x, y, z + 0.045);
    parent.add(ball, dot);
  };
  eye(-0.12);
  eye(0.12);
  const noseMesh = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), nose);
  noseMesh.position.set(0, y - 0.1, z + 0.02);
  const mouthMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.03), mouth);
  mouthMesh.position.set(0, y - 0.18, z);
  parent.add(noseMesh, mouthMesh);
}

function pointBlocked(solids, x, y, z) {
  for (let i = 0; i < solids.length; i++) {
    const box = solids[i];
    if (box.disabled) continue;
    if (x < box.minX - 0.2 || x > box.maxX + 0.2) continue;
    if (y < box.minY - 0.2 || y > box.maxY + 0.2) continue;
    if (z < box.minZ - 0.2 || z > box.maxZ + 0.2) continue;
    return true;
  }
  return false;
}

function pullCamera(solids, head, cam) {
  const dx = cam.x - head.x;
  const dy = cam.y - head.y;
  const dz = cam.z - head.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  const steps = Math.ceil(len / 0.35);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = head.x + dx * t;
    const y = head.y + dy * t;
    const z = head.z + dz * t;
    if (pointBlocked(solids, x, y, z)) {
      const back = (i - 1) / steps;
      return { x: head.x + dx * back, y: head.y + dy * back, z: head.z + dz * back };
    }
  }
  return cam;
}

function addClouds(scene, height) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 64;
  const g = canvas.getContext("2d");
  const glow = g.createRadialGradient(64, 32, 4, 64, 32, 52);
  glow.addColorStop(0, "rgba(255,255,255,0.88)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = glow;
  g.fillRect(0, 0, 128, 64);
  const map = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, opacity: 0.8 });
  const clouds = [];
  for (let i = 0; i < 7; i++) {
    const cloud = new THREE.Sprite(mat);
    cloud.position.set((i - 3) * 16, height + (i % 3) * 3, (i % 4) * 12 - 18);
    cloud.scale.set(22, 8, 1);
    scene.add(cloud);
    clouds.push(cloud);
  }
  return clouds;
}

function addSea(scene) {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: { time: { value: 0 } },
    vertexShader: `
      uniform float time;
      varying vec2 vUv;
      varying float vWave;
      void main() {
        vUv = uv;
        vec3 p = position;
        float wave = sin(p.x * 0.35 + time * 1.4) * 0.12 + cos(p.y * 0.28 + time) * 0.08;
        p.z += wave;
        vWave = wave;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      varying float vWave;
      void main() {
        float fres = smoothstep(0.2, 0.85, vUv.y);
        vec3 deep = vec3(0.04, 0.34, 0.52);
        vec3 shore = vec3(0.55, 0.84, 0.86);
        vec3 color = mix(shore, deep, fres);
        color += 0.08 + vWave;
        gl_FragColor = vec4(color, 0.86);
      }
    `,
  });
  const sea = new THREE.Mesh(new THREE.CircleGeometry(96, 40), mat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -4.2;
  scene.add(sea);
  return sea;
}

export function createView(canvas, level) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.7;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#7eb7e6");
  scene.fog = new THREE.Fog("#b9e4f6", 40, 120);
  const sky = new Sky();
  sky.scale.setScalar(800);
  sky.material.fog = false;
  const sun = new THREE.Vector3();
  const phi = (90 - 28) * Math.PI / 180;
  const theta = 180 * Math.PI / 180;
  sun.setFromSphericalCoords(1, phi, theta);
  sky.material.uniforms.sunPosition.value.copy(sun);
  sky.material.uniforms.turbidity.value = 2;
  sky.material.uniforms.rayleigh.value = 1;
  sky.material.uniforms.mieCoefficient.value = 0.004;
  sky.material.uniforms.mieDirectionalG.value = 0.76;
  scene.add(sky);
  const clouds = addClouds(scene, 48);
  const sea = addSea(scene);
  const camera = new THREE.PerspectiveCamera(68, 1, 0.08, 160);
  const camPos = new THREE.Vector3(12, 8, 14);
  let cameraReady = false;

  scene.add(new THREE.AmbientLight("#c8c0b0", 0.38));
  scene.add(new THREE.HemisphereLight("#8ea4b8", "#2a3828", 0.5));
  const moon = new THREE.DirectionalLight("#fff1c8", 1.45);
  moon.position.copy(sun).multiplyScalar(40);
  scene.add(moon);
  const lantern = new THREE.PointLight("#ffb15a", 2.6, 16, 2);
  scene.add(lantern);
  const wormLight = new THREE.PointLight("#ff3a28", 4.5, 13, 2);
  scene.add(wormLight);

  const mats = makeMaterials();
  const grouped = new Map();
  const dynamicMeshes = new Map();
  for (let i = 0; i < level.solids.length; i++) {
    const box = level.solids[i];
    const key = mats[box.mat] ? box.mat : "wood";
    if (box.dynamic) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(box.w, box.h, box.d), mats[key]);
      mesh.position.set(box.cx, box.top - box.h / 2, box.cz);
      scene.add(mesh);
      dynamicMeshes.set(box.id, mesh);
    } else {
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(box);
    }
  }
  for (let i = 0; i < level.visuals.length; i++) {
    const box = level.visuals[i];
    const key = mats[box.mat] ? box.mat : "fake";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push({
      minX: box.x - box.w / 2,
      maxX: box.x + box.w / 2,
      minY: box.y - box.h,
      maxY: box.y,
      minZ: box.z - box.d / 2,
      maxZ: box.z + box.d / 2,
      w: box.w,
      h: box.h,
      d: box.d,
    });
  }
  grouped.forEach((entries, key) => {
    scene.add(new THREE.Mesh(mergeBoxes(entries), mats[key] || mats.wood));
  });

  const postMat = mats.rail;
  const postHeight = STEP_COUNT * RISE + 8;
  const postY = postHeight / 2 - 4;
  const postGeo = new THREE.CylinderGeometry(0.28, 0.34, postHeight, 6);
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(x * (CORNER + 4.8), postY, z * (CORNER + 4.8));
    scene.add(post);
  }
  const pillarGeo = new THREE.CylinderGeometry(0.12, 0.16, postHeight, 5);
  for (let i = 0; i < 7; i++) {
    const ang = (i / 7) * Math.PI * 2;
    const pillar = new THREE.Mesh(pillarGeo, postMat);
    pillar.position.set(Math.cos(ang) * 2.7, postY - 2, Math.sin(ang) * 2.7);
    scene.add(pillar);
  }

  const player = buildPlayer();
  scene.add(player);
  const worm = buildWorm();
  scene.add(worm);
  const actorMeshes = new Map();
  for (let i = 0; i < level.actors.length; i++) {
    const actor = level.actors[i];
    const mesh = actor.kind === "beetle" ? buildBeetle() : buildSlapper();
    scene.add(mesh);
    actorMeshes.set(actor.id, mesh);
  }

  const props = new Map();
  const propRoot = new THREE.Group();
  scene.add(propRoot);
  const bananaMat = new THREE.MeshStandardMaterial({ color: "#f0c43a", roughness: 0.45 });
  const mineMat = new THREE.MeshStandardMaterial({ color: "#24343a", emissive: "#3ad0c4", emissiveIntensity: 0.35, roughness: 0.4 });
  const cocoonMat = new THREE.MeshStandardMaterial({ color: "#f3e6c8", roughness: 0.55, emissive: "#6a5430", emissiveIntensity: 0.15 });
  const sporeMat = new THREE.MeshStandardMaterial({ color: "#e6c56a", emissive: "#ffb020", emissiveIntensity: 0.7, roughness: 0.3 });
  const lampMat = new THREE.MeshStandardMaterial({ color: "#ffd28a", emissive: "#ffaa44", emissiveIntensity: 0.8 });
  for (let i = 0; i < level.triggers.length; i++) {
    const trigger = level.triggers[i];
    let mesh = null;
    if (trigger.kind === "banana") {
      mesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), bananaMat);
      mesh.scale.set(1.6, 0.45, 0.7);
    } else if (trigger.kind === "mine") {
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.22, 8), mineMat);
    } else if (trigger.kind === "cocoon") {
      mesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), cocoonMat);
      mesh.scale.set(0.8, 1.15, 0.8);
    } else if (trigger.kind === "spore") {
      mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), sporeMat);
    } else if (trigger.kind === "checkpoint") {
      mesh = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6), mats.rail);
      pole.position.y = 0.2;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), lampMat);
      bulb.position.y = 0.85;
      mesh.add(pole, bulb);
    }
    if (!mesh) continue;
    mesh.position.set(trigger.x, trigger.y + (trigger.kind === "checkpoint" ? 0 : 0.28), trigger.z);
    propRoot.add(mesh);
    props.set(trigger.id, mesh);
  }
  for (let i = 0; i < level.banners.length; i++) {
    const banner = level.banners[i];
    const sprite = labelSprite(banner.text, "#f2d48a");
    sprite.position.set(banner.x, banner.y, banner.z);
    propRoot.add(sprite);
  }
  const padSign = labelSprite("铜盘", "#f2d48a");
  padSign.position.set(level.keypad.x, level.keypad.y + 1.8, level.keypad.z);
  propRoot.add(padSign);

  const bell = new THREE.Group();
  const bellMat = new THREE.MeshStandardMaterial({
    color: "#e8c56a",
    emissive: "#a86a18",
    emissiveIntensity: 0.35,
    metalness: 0.45,
    roughness: 0.32,
  });
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.42, 0.7, 12), bellMat);
  cup.position.y = 1.3;
  const clapper = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), bellMat);
  clapper.position.y = 1.05;
  bell.add(cup, clapper);
  bell.position.set(level.goal.x, level.goal.y, level.goal.z);
  scene.add(bell);

  const shotGroup = new THREE.Group();
  scene.add(shotGroup);
  const streakGeo = new THREE.BoxGeometry(1, 1, 1);
  const streakMat = new THREE.MeshBasicMaterial({ color: "#ff9a1f" });
  const coreGeo = new THREE.SphereGeometry(1, 10, 10);
  const coreMat = new THREE.MeshBasicMaterial({ color: "#fff6d0" });
  const flashMat = new THREE.MeshBasicMaterial({ color: "#ffe7a8" });
  const aimAxis = new THREE.Vector3(0, 0, 1);
  const aimDir = new THREE.Vector3();
  const dustCount = 80;
  const dustGeo = new THREE.BufferGeometry();
  const dustPos = new Float32Array(dustCount * 3);
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({ color: "#d7c2a4", size: 0.06, transparent: true, opacity: 0.45 }),
  );
  scene.add(dust);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let bob = 0;

  let pinnedW = 0;
  let pinnedH = 0;

  function pinCanvas() {
    const vv = window.visualViewport;
    const width = Math.max(1, Math.round((vv && vv.width) || window.innerWidth || 1));
    const height = Math.max(1, Math.round((vv && vv.height) || window.innerHeight || 1));
    canvas.style.setProperty("position", "fixed", "important");
    canvas.style.setProperty("left", "0px", "important");
    canvas.style.setProperty("top", "0px", "important");
    canvas.style.setProperty("right", "auto", "important");
    canvas.style.setProperty("bottom", "auto", "important");
    canvas.style.setProperty("width", width + "px", "important");
    canvas.style.setProperty("height", height + "px", "important");
    canvas.style.setProperty("margin", "0", "important");
    canvas.style.setProperty("transform", "none", "important");
    return { width, height };
  }

  function resize() {
    const box = pinCanvas();
    if (box.width === pinnedW && box.height === pinnedH) return;
    pinnedW = box.width;
    pinnedH = box.height;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(box.width, box.height, false);
    pinCanvas();
    camera.aspect = box.width / Math.max(1, box.height);
    camera.updateProjectionMatrix();
  }

  function placeWorm(x, y, z, phase, time) {
    const segments = worm.userData.segments;
    const open = phase === "windup" ? 1 : phase === "lunge" ? 1.2 : 0.25;
    worm.userData.mouth.scale.setScalar(0.7 + open * 0.55);
    for (let i = 0; i < segments.length; i++) {
      const pull = i === 0 ? 1 : 1 / (1 + i * 0.28);
      const wobble = Math.sin(time * 4 + i * 0.7) * 0.06;
      segments[i].position.set(x * pull + wobble, y + 0.55 - i * 0.58, z * pull + Math.cos(time * 3 + i) * 0.05);
      segments[i].scale.setScalar(i === 0 && phase === "windup" ? 1.12 : 1);
    }
    wormLight.position.set(x, y + 0.7, z);
    wormLight.intensity = phase === "lunge" ? 9 : phase === "windup" ? 7 : 3.2;
  }

  function render(state, dt) {
    resize();
    const time = state.previewT + state.time;
    sea.material.uniforms.time.value = time;
    for (let i = 0; i < clouds.length; i++) {
      clouds[i].position.x += 0.02;
      if (clouds[i].position.x > 80) clouds[i].position.x = -80;
    }
    mats.safe.emissiveIntensity = 0.32 + Math.sin(time * 3) * 0.12;
    mats.magma.emissiveIntensity = 0.4 + Math.sin(time * 6) * 0.15;
    bell.rotation.z = Math.sin(time * 2) * 0.08;
    const solidById = new Map();
    for (let i = 0; i < state.solids.length; i++) solidById.set(state.solids[i].id, state.solids[i]);
    dynamicMeshes.forEach((mesh, id) => {
      const box = solidById.get(id);
      if (!box) return;
      mesh.visible = !box.disabled;
      mesh.position.set(box.cx, box.top - box.h / 2, box.cz);
    });
    for (let i = 0; i < state.level.triggers.length; i++) {
      const trigger = state.level.triggers[i];
      const mesh = props.get(trigger.id);
      if (!mesh) continue;
      if (trigger.kind === "cocoon" || trigger.kind === "spore") {
        mesh.visible = !state.collected.has(trigger.id);
        mesh.rotation.y = time;
      } else if (trigger.kind === "mine") {
        mesh.visible = state.time >= (state.mineCool.get(trigger.id) || 0);
      } else if (trigger.kind === "banana") mesh.rotation.z = Math.sin(time + trigger.step) * 0.2;
    }

    const menu = state.status === "menu";
    if (menu) {
      const ang = state.previewT * (reduceMotion ? 0.05 : 0.18);
      placeWorm(Math.cos(ang) * 2.1, 3.2 + Math.sin(state.previewT * 0.8) * 1.4, Math.sin(ang) * 2.1, "chase", time);
      player.position.set(state.body.x, state.body.y, state.body.z);
      player.rotation.y = state.yaw;
      player.visible = true;
      const desired = new THREE.Vector3(Math.sin(ang) * 18, 9, Math.cos(ang) * 18);
      camPos.lerp(desired, 1 - Math.exp(-2 * dt));
      camera.position.copy(camPos);
      camera.lookAt(0, 8, 0);
      cameraReady = false;
    } else {
      const body = state.body;
      const speed = Math.hypot(body.vx, body.vz);
      if (speed > 0.8 && body.grounded) bob += dt * speed * 2.2;
      player.position.set(body.x, body.y + Math.sin(bob) * 0.03, body.z);
      const flicker = state.iframe > 0 && state.time > 1 && Math.sin(time * 24) < 0;
      player.visible = !flicker && !state.scope;
      const facing = speed > 0.45 ? Math.atan2(body.vx, body.vz) : Math.atan2(-Math.sin(state.yaw), -Math.cos(state.yaw));
      player.rotation.y = facing;
      player.userData.glove.position.z = state.slapT > 0 ? 0.42 : 0.12;
      const swing = Math.sin(bob) * 0.25;
      player.userData.legs[0].rotation.x = swing;
      player.userData.legs[1].rotation.x = -swing;
      lantern.position.set(body.x - 0.3, body.y + 1.15, body.z);
      lantern.intensity = 2.3 + Math.sin(time * 11) * 0.18;
      placeWorm(state.worm.x, state.worm.y, state.worm.z, state.worm.phase, time);
      while (shotGroup.children.length) shotGroup.remove(shotGroup.children[0]);
      const shots = state.shots || [];
      for (let s = 0; s < shots.length; s++) {
        const shot = shots[s];
        const span = shot.maxLife || 0.38;
        const progress = 1 - shot.life / span;
        const reach = shot.reach || 16;
        const along = 0.85 + Math.max(0, reach - 0.85) * progress;
        aimDir.set(shot.dx, shot.dy, shot.dz);
        const streak = new THREE.Mesh(streakGeo, streakMat);
        streak.scale.set(0.14, 0.14, 3.2);
        streak.position.set(shot.x + shot.dx * along, shot.y + shot.dy * along, shot.z + shot.dz * along);
        streak.quaternion.setFromUnitVectors(aimAxis, aimDir);
        const core = new THREE.Mesh(coreGeo, coreMat);
        core.scale.setScalar(0.16);
        core.position.set(shot.x + shot.dx * (along + 1.4), shot.y + shot.dy * (along + 1.4), shot.z + shot.dz * (along + 1.4));
        shotGroup.add(streak, core);
        if (progress < 0.12) {
          const flash = new THREE.Mesh(coreGeo, flashMat);
          flash.scale.setScalar(0.18);
          flash.position.set(shot.x + shot.dx * 0.9, shot.y + shot.dy * 0.9, shot.z + shot.dz * 0.9);
          shotGroup.add(flash);
        }
        if (progress > 0.86) {
          const impact = new THREE.Mesh(coreGeo, flashMat);
          impact.scale.setScalar(0.35 + (progress - 0.86) * 2.2);
          impact.position.set(shot.x + shot.dx * reach, shot.y + shot.dy * reach, shot.z + shot.dz * reach);
          shotGroup.add(impact);
        }
      }
      const actorById = new Map();
      for (let i = 0; i < state.actors.length; i++) actorById.set(state.actors[i].id, state.actors[i]);
      actorMeshes.forEach((mesh, id) => {
        const actor = actorById.get(id);
        if (!actor) return;
        mesh.visible = actor.alive;
        mesh.position.set(actor.x, actor.y, actor.z);
        if (actor.kind === "slapper" && actor.state === "windup") mesh.rotation.y = Math.atan2(body.x - actor.x, body.z - actor.z);
        else if (Math.hypot(actor.vx, actor.vz) > 0.2) mesh.rotation.y = Math.atan2(actor.vx, actor.vz);
        if (mesh.userData.glove) {
          mesh.userData.glove.position.z = actor.state === "windup" ? -0.15 : actor.state === "swing" ? 0.55 : 0.2;
        }
      });
      const dist = state.scope ? 1.7 : state.status === "won" ? 9.5 : 6.1;
      const goalFov = state.scope && state.status === "play" ? (state.steady ? 12 : 20) : 68;
      camera.fov += (goalFov - camera.fov) * Math.min(1, dt * 12);
      camera.updateProjectionMatrix();
      const back = Math.cos(state.pitch) * dist;
      const lift = Math.sin(state.pitch) * dist;
      const head = { x: body.x, y: body.y + 1.25, z: body.z };
      let desired = {
        x: head.x + Math.sin(state.yaw) * back,
        y: head.y + 0.65 - lift,
        z: head.z + Math.cos(state.yaw) * back,
      };
      desired = pullCamera(state.solids, head, desired);
      if (state.pitch < 0.55 && desired.y < body.y + 0.85) desired.y = body.y + 0.85;
      const shake = reduceMotion ? 0 : state.shake;
      const desiredVec = new THREE.Vector3(desired.x, desired.y, desired.z);
      if (!cameraReady) {
        camPos.copy(desiredVec);
        cameraReady = true;
      } else camPos.lerp(desiredVec, 1 - Math.exp(-10 * dt));
      camera.position.set(camPos.x + (Math.random() - 0.5) * shake, camPos.y + (Math.random() - 0.5) * shake * 0.6, camPos.z);
      camera.lookAt(head.x, head.y, head.z);
    }

    for (let i = 0; i < dustCount; i++) {
      const ang = time * 0.2 + i;
      dustPos[i * 3] = player.position.x + Math.sin(ang * 1.7) * (2 + (i % 5));
      dustPos[i * 3 + 1] = player.position.y + 1 + ((i * 17) % 30) / 8;
      dustPos[i * 3 + 2] = player.position.z + Math.cos(ang) * (2 + (i % 4));
    }
    dust.geometry.attributes.position.needsUpdate = true;
    renderer.render(scene, camera);
  }

  resize();
  return { resize, render };
}
