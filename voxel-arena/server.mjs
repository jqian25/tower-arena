import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'
import { ImprovedNoise } from 'three/examples/jsm/math/ImprovedNoise.js'
import { landmarks } from './landmarks.js'
import { airport } from './airport.js'
import { skins } from './skins.js'
import { caveSites, oresAt, springSite } from './caves.js'
import { terrainHeight } from './height.js'

const PORT = 8765
const arenaRoot = fileURLToPath(new URL('./dist/', import.meta.url))
const towerRoot = fileURLToPath(new URL('../bug-tower/', import.meta.url))
const noise = new ImprovedNoise()
const seed = Math.random() * 200 - 100
const weapons = {
  rifle: { damage: 18, delay: 0.16, range: 82 },
  shotgun: { damage: 8, delay: 0.72, range: 28, pellets: 7 },
  smg: { damage: 8, delay: 0.08, range: 44 },
  sniper: { damage: 86, delay: 1.15, range: 142 },
  knife: { damage: 42, delay: 0.45, range: 3.4 }
}
const prices = { vest: 40, drum: 30, glass: 30, med: 25, grenade: 20, bug: 40, feed: 20 }
const oreValue = { gold: 18, diamond: 40 }
const vehicleKinds = {
  bike: { name: '摩托车', hp: 80, speed: 12.4 },
  car: { name: '汽车', hp: 160, speed: 8.2 },
  ship: { name: '船', hp: 210, speed: 10.4 },
  plane: { name: '飞机', hp: 180, speed: 20 }
}
const SEA = 25.5
const lootKinds = ['knife', 'rifle', 'smg', 'sniper', 'grenade']
const names = ['拾灯', '石工', '夜巡', '破壁', '塔卫', '霜线', '赤岗', '北风']

function surface(x, z) {
  return terrainHeight(x, z, noise.noise(x / 22, z / 22, seed))
}

function scatterAround(x, z, radius) {
  const spotX = Math.round(x + (Math.random() - 0.5) * radius * 2)
  const spotZ = Math.round(z + (Math.random() - 0.5) * radius * 2)
  return { x: spotX, z: spotZ, y: surface(spotX, spotZ) + 1.7 }
}

function findOre(x, y, z) {
  for (const site of caveSites) {
    const ground = surface(site.x, site.z)
    for (const ore of oresAt(site, ground)) {
      if (ore.x === x && ore.y === y && ore.z === z) return ore
    }
  }
  return null
}

const pets = [
  { id: 'fox1', name: '狐狸', shape: 'fox', homeX: 18, homeZ: 24 },
  { id: 'fox2', name: '小狐', shape: 'fox', homeX: -36, homeZ: 48 },
  { id: 'fox3', name: '赤狐', shape: 'fox', homeX: 36, homeZ: -8 },
  { id: 'fox4', name: '雪狐', shape: 'fox', homeX: -12, homeZ: 64 }
].map(pet => ({
  ...pet,
  x: pet.homeX,
  z: pet.homeZ,
  y: surface(pet.homeX, pet.homeZ) + 0.55,
  yaw: 0,
  hp: 30,
  maxHp: 30,
  alive: true,
  team: 'pet',
  lead: false,
  kind: 'bot'
}))

const vehicles = []
function spawnVehicle(kind) {
  const spot = scatter()
  const spec = vehicleKinds[kind]
  vehicles.push({
    id: kind[0] + Math.random().toString(36).slice(2, 7),
    kind,
    name: spec.name,
    speed: spec.speed,
    hp: spec.hp,
    maxHp: spec.hp,
    x: spot.x,
    y: spot.y,
    z: spot.z,
    yaw: Math.random() * Math.PI * 2,
    alive: true,
    driver: null,
    respawn: 0
  })
}
for (let i = 0; i < 3; i++) spawnVehicle('bike')
for (let i = 0; i < 3; i++) spawnVehicle('car')

function wreck(ride) {
  ride.hp = 0
  ride.alive = false
  ride.respawn = 12
  const driver = [...players.values()].find(item => item.id === ride.driver)
  if (driver) {
    driver.vehicle = null
    send(driver.socket, { type: 'eject' })
    if (driver.alive) driver.hp = Math.max(1, driver.hp - 12)
  }
  ride.driver = null
  broadcast({ type: 'feed', text: `${ride.name} 被打坏了` })
}

function strike(target, amount, killerName, killer) {
  if (target && target.vehicle) {
    const ride = vehicles.find(item => item.id === target.vehicle && item.alive)
    if (ride) {
      ride.hp -= amount
      if (ride.hp <= 0) wreck(ride)
      return
    }
  }
  damage(target, amount, killerName, killer)
}

function movePets(dt) {
  for (const pet of pets) {
    const tx = pet.lead ? springSite.x : pet.homeX + Math.sin(Date.now() / 900 + pet.homeZ) * 2.5
    const tz = pet.lead ? springSite.z : pet.homeZ + Math.cos(Date.now() / 800 + pet.homeX) * 2.5
    const dx = tx - pet.x
    const dz = tz - pet.z
    const dist = Math.hypot(dx, dz) || 1
    if (dist > 0.45) {
      const speed = pet.lead ? 3.3 : 1.05
      pet.x += (dx / dist) * speed * dt
      pet.z += (dz / dist) * speed * dt
      pet.yaw = Math.atan2(dx, dz)
    }
    pet.y = surface(Math.round(pet.x), Math.round(pet.z)) + 0.55
  }
}

function scatter() {
  const mark = landmarks[Math.floor(Math.random() * landmarks.length)]
  return scatterAround(mark.x, mark.z, 22)
}

const waterCells = []
for (let x = -168; x <= 168; x += 3) {
  for (let z = 12; z <= 252; z += 3) {
    if (surface(x, z) <= 25) waterCells.push({ x, z })
  }
}

function waterSpot() {
  if (waterCells.length === 0) return { x: 0, z: 140, y: SEA + 0.7 }
  const cell = waterCells[Math.floor(Math.random() * waterCells.length)]
  return { x: cell.x, z: cell.z, y: SEA + 0.7 }
}

function takeWater(used, minDist) {
  if (waterCells.length === 0) return { x: 0, z: 140 }
  for (let n = 0; n < 40; n++) {
    const cell = waterCells[Math.floor(Math.random() * waterCells.length)]
    let clear = true
    for (const spot of used) {
      if (Math.hypot(spot.x - cell.x, spot.z - cell.z) < minDist) {
        clear = false
        break
      }
    }
    if (clear) return { x: cell.x, z: cell.z }
  }
  const cell = waterCells[Math.floor(Math.random() * waterCells.length)]
  return { x: cell.x, z: cell.z }
}

function airportSpot(index) {
  const x = airport.x + 10
  const z = airport.z + (index % 2 === 0 ? -5 : 5)
  return { x, z, y: surface(x, z) + 0.9 }
}

function landSpot() {
  for (let n = 0; n < 40; n++) {
    const x = Math.round((Math.random() - 0.5) * 160)
    const z = Math.round((Math.random() - 0.5) * 140)
    if (surface(x, z) >= 27) return { x, z }
  }
  return { x: 28, z: -18 }
}

const traps = []
for (let i = 0; i < 10; i++) traps.push({ ...landSpot(), armed: true, cool: 0 })

for (let i = 0; i < 3; i++) {
  const spot = waterSpot()
  const spec = vehicleKinds.ship
  vehicles.push({
    id: 's' + Math.random().toString(36).slice(2, 7),
    kind: 'ship',
    name: spec.name,
    speed: spec.speed,
    hp: spec.hp,
    maxHp: spec.hp,
    ...spot,
    yaw: Math.random() * Math.PI * 2,
    alive: true,
    driver: null,
    respawn: 0
  })
}

for (let i = 0; i < 2; i++) {
  const spot = airportSpot(i)
  const spec = vehicleKinds.plane
  vehicles.push({
    id: 'pl' + i,
    kind: 'plane',
    name: spec.name,
    speed: spec.speed,
    hp: spec.hp,
    maxHp: spec.hp,
    ...spot,
    yaw: Math.PI / 2,
    alive: true,
    driver: null,
    respawn: 0
  })
}

const players = new Map()
const bots = []
landmarks.forEach((mark, index) => {
  const ally = scatterAround(mark.x, mark.z, 16)
  bots.push({
    id: 'a' + index,
    name: '队友' + (index + 1),
    team: 'ally',
    maxHp: 80,
    ...ally,
    yaw: 0,
    hp: 80,
    alive: true,
    cool: 0.8 + index * 0.1,
    homeX: ally.x,
    homeZ: ally.z,
    kind: 'bot',
    shape: 'person'
  })
  for (let n = 0; n < 2; n++) {
    const enemy = scatterAround(mark.x, mark.z, 18)
    const count = index * 2 + n
    bots.push({
      id: 'e' + count,
      name: '敌军' + (count + 1),
      team: 'enemy',
      maxHp: 100,
      ...enemy,
      yaw: 0,
      hp: 100,
      alive: true,
      cool: 0.5 + n * 0.15,
      homeX: enemy.x,
      homeZ: enemy.z,
      kind: 'bot',
      shape: 'bug'
    })
  }
})

for (let i = 0; i < 2; i++) {
  const spot = waterSpot()
  bots.push({
    id: 'sq' + i,
    name: '鱿鱼' + (i + 1),
    team: 'beast',
    shape: 'squid',
    hp: 240,
    maxHp: 240,
    x: spot.x,
    y: SEA + 0.4,
    z: spot.z,
    yaw: 0,
    alive: true,
    cool: 0.8,
    homeX: spot.x,
    homeZ: spot.z,
    respawn: 0,
    kind: 'bot'
  })
}

const fishKinds = [
  { level: 1, name: '米诺' },
  { level: 2, name: '绿鳍' },
  { level: 3, name: '金鱼' },
  { level: 4, name: '赤鲤' },
  { level: 5, name: '河豚' }
]
const fishHomes = []
for (let i = 0; i < 12; i++) {
  const spot = takeWater(fishHomes, 16)
  fishHomes.push(spot)
  const kind = fishKinds[i % fishKinds.length]
  bots.push({
    id: 'fish' + i,
    name: kind.name,
    team: 'fish',
    shape: 'fish',
    level: kind.level,
    hp: 24 + kind.level * 16,
    maxHp: 24 + kind.level * 16,
    x: spot.x,
    y: SEA + 0.45,
    z: spot.z,
    yaw: Math.random() * Math.PI * 2,
    alive: true,
    cool: 0.4,
    homeX: spot.x,
    homeZ: spot.z,
    respawn: 0,
    kind: 'bot'
  })
}

let bugSerial = 1
function spawnAllyBug(near) {
  const hired = bots.filter(bot => bot.hired).length
  if (hired >= 6) return false
  const id = 'bug' + bugSerial
  const name = '虫友' + bugSerial
  bugSerial += 1
  const x = Math.round(near.x + (Math.random() < 0.5 ? -4 : 4))
  const z = Math.round(near.z + (Math.random() < 0.5 ? -4 : 4))
  const spot = { x, z, y: surface(x, z) + 1.7 }
  bots.push({
    id,
    name,
    team: 'ally',
    shape: 'bug',
    hired: true,
    maxHp: 90,
    ...spot,
    yaw: near.yaw || 0,
    hp: 90,
    alive: true,
    cool: 0.3,
    homeX: spot.x,
    homeZ: spot.z,
    kind: 'bot'
  })
  broadcast({ type: 'feed', text: `${name} 来了，它会去咬红虫子` })
  return true
}

const pickups = []
function dropLoot() {
  const spot = scatter()
  pickups.push({
    id: 'p' + Math.random().toString(36).slice(2, 7),
    kind: lootKinds[Math.floor(Math.random() * lootKinds.length)],
    x: spot.x,
    y: spot.y,
    z: spot.z
  })
}
function dropCoin() {
  const spot = scatter()
  pickups.push({
    id: 'c' + Math.random().toString(36).slice(2, 7),
    kind: 'coin',
    worth: 15,
    x: spot.x,
    y: spot.y,
    z: spot.z
  })
}
for (let i = 0; i < 14; i++) dropLoot()
for (let i = 0; i < 8; i++) dropCoin()

function send(socket, data) {
  if (socket.readyState === 1) socket.send(JSON.stringify(data))
}

function walletOf(player, extra = {}) {
  return {
    type: 'wallet',
    money: player.money,
    gold: player.gold,
    diamond: player.diamond,
    feed: player.feed,
    skin: player.skin,
    skins: player.skins,
    vest: !!player.vest,
    drum: !!player.drum,
    glass: !!player.glass,
    ...extra
  }
}

function goldCost(price) {
  return Math.max(1, Math.ceil(price / oreValue.gold))
}

function chargePlayer(player, msg, moneyPrice, goldPrice) {
  if (moneyPrice <= 0 && goldPrice <= 0) return true
  if (msg.pay === 'gold') {
    if (player.gold < goldPrice) return false
    player.gold -= goldPrice
    return true
  }
  if (player.money < moneyPrice) return false
  player.money -= moneyPrice
  return true
}

function denyShop(player, text) {
  send(player.socket, walletOf(player, { fail: true, shop: true }))
  send(player.socket, { type: 'feed', text })
}

function broadcast(data, except) {
  for (const player of players.values()) {
    if (player.socket !== except) send(player.socket, data)
  }
}

function poseOf(player) {
  return {
    id: player.id,
    name: player.name,
    x: player.x,
    y: player.y,
    z: player.z,
    yaw: player.yaw,
    hp: player.hp,
    maxHp: 100,
    alive: player.alive,
    kind: 'player',
    team: 'ally',
    shape: player.swimming ? 'fish' : 'person',
    level: player.swimming ? player.fishLevel : 0
  }
}

function damage(target, amount, killerName, killer) {
  if (!target.alive) return false
  const taken = target.vest ? Math.max(1, Math.round(amount * 0.62)) : amount
  target.hp -= taken
  if (target.hp > 0) return false
  target.hp = 0
  target.alive = false
  target.respawn = 2.4
  const text = `${killerName} 打倒了 ${target.name}`
  broadcast({ type: 'feed', text })
  if (target.socket) {
    target.indoors = false
    send(target.socket, { type: 'down' })
    if (target.vehicle) {
      const ride = vehicles.find(item => item.id === target.vehicle)
      if (ride && ride.driver === target.id) ride.driver = null
      target.vehicle = null
      send(target.socket, { type: 'eject' })
    }
  }
  if (killer && killer.socket && target.team === 'enemy') {
    killer.money += 40
    send(killer.socket, walletOf(killer, { shop: true, item: 'kill' }))
  }
  if (killer && killer.socket && target.shape === 'squid') {
    killer.money += 25
    send(killer.socket, walletOf(killer, { shop: true, item: 'kill' }))
  }
  if (target.team === 'mimic' && target.pitOwner) {
    const owner = [...players.values()].find(item => item.id === target.pitOwner)
    const left = bots.filter(item => item.pitOwner === target.pitOwner && item.alive && item.team === 'mimic')
    if (owner && left.length === 0) exitPit(owner)
  }
  if (target.socket && target.inPit) {
    for (const item of bots) if (item.pitOwner === target.id) item.alive = false
    target.inPit = false
    send(target.socket, { type: 'surface', x: 8, y: 42, z: 8 })
  }
  return true
}

function exitPit(player) {
  player.inPit = false
  player.x = player.returnX + 3.4
  player.z = player.returnZ + 1.2
  player.y = surface(Math.round(player.x), Math.round(player.z)) + 2.2
  for (const item of bots) if (item.pitOwner === player.id) item.alive = false
  send(player.socket, { type: 'surface', x: player.x, y: player.y, z: player.z })
  broadcast({ type: 'feed', text: '伪人被消灭了，你回到了地面' })
}

function nearestShore(x, z) {
  let best = null
  let bestDist = 1e9
  for (let radius = 2; radius <= 48; radius += 2) {
    for (let step = 0; step < 10; step++) {
      const angle = (step / 10) * Math.PI * 2
      const sx = Math.round(x + Math.cos(angle) * radius)
      const sz = Math.round(z + Math.sin(angle) * radius)
      if (surface(sx, sz) < SEA + 0.8) continue
      const dist = Math.hypot(sx - x, sz - z)
      if (dist < bestDist) {
        bestDist = dist
        best = { x: sx, z: sz, y: surface(sx, sz) + 2.2 }
      }
    }
    if (best) break
  }
  return best || { x: 8, z: 8, y: 42 }
}

function fishTitle(level) {
  return fishKinds[Math.min(fishKinds.length, Math.max(1, level)) - 1].name
}

function wetCell(x, z) {
  return surface(Math.round(x), Math.round(z)) <= 25
}

function moveWet(bot, tx, tz, speed, dt) {
  const dx = tx - bot.x
  const dz = tz - bot.z
  const len = Math.hypot(dx, dz) || 1
  const step = Math.min(len, speed * dt)
  if (step < 0.001) return false
  const nx = bot.x + (dx / len) * step
  const nz = bot.z + (dz / len) * step
  if (wetCell(nx, nz)) {
    bot.x = nx
    bot.z = nz
    bot.yaw = Math.atan2(dx, dz)
    return true
  }
  if (Math.abs(dx) > 0.05 && wetCell(bot.x + Math.sign(dx) * step, bot.z)) {
    bot.x += Math.sign(dx) * step
    bot.yaw = Math.atan2(Math.sign(dx), 0)
    return true
  }
  if (Math.abs(dz) > 0.05 && wetCell(bot.x, bot.z + Math.sign(dz) * step)) {
    bot.z += Math.sign(dz) * step
    bot.yaw = Math.atan2(0, Math.sign(dz))
    return true
  }
  if (!wetCell(bot.x, bot.z)) {
    const hx = bot.homeX - bot.x
    const hz = bot.homeZ - bot.z
    const hlen = Math.hypot(hx, hz) || 1
    const back = Math.min(hlen, speed * dt)
    bot.x += (hx / hlen) * back
    bot.z += (hz / hlen) * back
  }
  return false
}

function spawnFishAlly(near, index) {
  let x = Math.round(near.x + ((index % 5) - 2) * 2)
  let z = Math.round(near.z + 2 + Math.floor(index / 5) * 2)
  if (surface(x, z) < SEA + 0.8) {
    x = near.x
    z = near.z
  }
  bots.push({
    id: 'fa' + Math.random().toString(36).slice(2, 7),
    name: '鱼友' + (index + 1),
    team: 'ally',
    shape: 'person',
    fromFish: true,
    maxHp: 80,
    hp: 80,
    x,
    z,
    y: surface(x, z) + 1.7,
    yaw: 0,
    alive: true,
    cool: 0.4,
    homeX: x,
    homeZ: z,
    kind: 'bot'
  })
}

function shoreOut(player, reason) {
  if (!player.swimming) return
  const spot = nearestShore(player.x, player.z)
  const gained = player.eaten
  const room = Math.max(0, 12 - bots.filter(bot => bot.fromFish).length)
  const count = Math.min(gained, room)
  for (let i = 0; i < count; i++) spawnFishAlly(spot, i)
  player.swimming = false
  player.eaten = 0
  player.fishLevel = 1
  player.x = spot.x
  player.z = spot.z
  player.y = spot.y
  send(player.socket, {
    type: 'ashore',
    reason,
    x: spot.x,
    y: spot.y,
    z: spot.z,
    allies: count,
    eaten: gained
  })
  const clipped = gained > count && count > 0
  const extra = count ? `，鱼友 +${count}${clipped ? '（鱼友最多 12 个）' : ''}` : ''
  const text = reason === 'eaten'
    ? `被更大的鱼吃掉了，回到岸上${extra}`
    : `上岸了${count ? `，吃掉的 ${gained} 条鱼变成了 ${count} 个队友${clipped ? '（鱼友最多 12 个）' : ''}` : ''}`
  send(player.socket, { type: 'feed', text })
}

function eatFish(player, fish) {
  fish.alive = false
  fish.hp = 0
  fish.respawn = 8
  player.eaten += 1
  const next = Math.min(5, 1 + Math.floor(player.eaten / 2))
  const grew = next > player.fishLevel
  player.fishLevel = next
  send(player.socket, {
    type: 'fish',
    level: player.fishLevel,
    eaten: player.eaten,
    name: fishTitle(player.fishLevel),
    grew
  })
  send(player.socket, { type: 'feed', text: grew ? `吃掉${fish.name}，升级成${fishTitle(next)}` : `吃掉${fish.name}` })
}

function enterPit(player, trap) {
  if (player.inPit) return
  player.inPit = true
  player.returnX = player.x
  player.returnZ = player.z
  for (let i = 0; i < 3; i++) {
    bots.push({
      id: 'm' + player.id + i + Math.random().toString(36).slice(2, 4),
      name: '伪人' + (i + 1),
      team: 'mimic',
      shape: 'mimic',
      hp: 64,
      maxHp: 64,
      alive: true,
      x: player.x + (i - 1) * 3.2,
      z: player.z + 5 + i,
      y: player.y,
      yaw: Math.PI,
      cool: 0.35,
      homeX: player.x,
      homeZ: player.z,
      pitOwner: player.id,
      respawn: 0,
      kind: 'bot'
    })
  }
  send(player.socket, { type: 'pit' })
  broadcast({ type: 'feed', text: `${player.name} 掉进了黑地洞` })
  trap.armed = false
  trap.cool = 24
}

function tick(dt) {
  for (const bot of bots) {
    if (!bot.alive) {
      if (bot.team === 'mimic') continue
      bot.respawn -= dt
      if (bot.respawn <= 0) {
        bot.alive = true
        bot.hp = bot.maxHp || 80
        bot.x = bot.homeX
        bot.z = bot.homeZ
        bot.y = bot.shape === 'squid' ? SEA + 0.4 : bot.shape === 'fish' ? SEA + 0.45 : surface(bot.x, bot.z) + 1.7
      }
      continue
    }
    if (bot.shape === 'squid') {
      let prey = null
      let preyDist = 40
      for (const player of players.values()) {
        if (!player.alive || player.inPit || player.indoors || player.swimming) continue
        const dist = Math.hypot(player.x - bot.x, player.z - bot.z)
        const ridingShip = player.vehicle
          ? vehicles.some(item => item.id === player.vehicle && item.kind === 'ship')
          : false
        const wet = surface(Math.round(player.x), Math.round(player.z)) < SEA + 0.2 || ridingShip
        if (wet && dist < preyDist) {
          preyDist = dist
          prey = player
        }
      }
      if (prey) {
        const dx = prey.x - bot.x
        const dz = prey.z - bot.z
        const len = Math.hypot(dx, dz) || 1
        bot.yaw = Math.atan2(dx, dz)
        bot.x += (dx / len) * 2.35 * dt
        bot.z += (dz / len) * 2.35 * dt
        bot.cool -= dt
        if (preyDist < 7 && bot.cool <= 0) {
          bot.cool = 0.7
          strike(prey, prey.vehicle ? 18 : 12, bot.name, null)
        }
      } else {
        bot.x += Math.sin(Date.now() / 800 + bot.homeX) * 1.2 * dt
        bot.z += Math.cos(Date.now() / 900 + bot.homeZ) * 1.2 * dt
      }
      bot.y = SEA + 0.4
      continue
    }
    if (bot.shape === 'fish') {
      let prey = null
      let preyDist = 36
      for (const player of players.values()) {
        if (!player.alive || !player.swimming || player.inPit) continue
        const dist = Math.hypot(player.x - bot.x, player.z - bot.z)
        if (bot.level > player.fishLevel && dist < preyDist) {
          preyDist = dist
          prey = player
        }
      }
      if (prey) {
        moveWet(bot, prey.x, prey.z, 8.4 + bot.level * 1.15, dt)
        const dist = Math.hypot(prey.x - bot.x, prey.z - bot.z)
        if (dist < 2.15 + bot.level * 0.2) shoreOut(prey, 'eaten')
      } else {
        let flee = null
        let fleeDist = 16
        for (const player of players.values()) {
          if (!player.alive || !player.swimming) continue
          const dist = Math.hypot(player.x - bot.x, player.z - bot.z)
          if (player.fishLevel >= bot.level && dist < fleeDist) {
            fleeDist = dist
            flee = player
          }
        }
        if (flee && fleeDist < 1.85 + flee.fishLevel * 0.18) {
          eatFish(flee, bot)
        } else if (flee) {
          moveWet(bot, bot.x * 2 - flee.x, bot.z * 2 - flee.z, 5.2 + bot.level * 0.35, dt)
        } else {
          const ang = Date.now() / 900 + bot.homeX
          const tx = bot.homeX + Math.sin(ang) * 7
          const tz = bot.homeZ + Math.cos(ang * 0.85) * 7
          if (!moveWet(bot, tx, tz, 2.4, dt)) moveWet(bot, bot.homeX, bot.homeZ, 2.4, dt)
        }
      }
      bot.y = SEA + 0.45
      continue
    }
    if (bot.team === 'mimic') {
      const owner = [...players.values()].find(item => item.id === bot.pitOwner && item.inPit && item.alive)
      if (!owner) {
        bot.alive = false
        continue
      }
      const dx = owner.x - bot.x
      const dz = owner.z - bot.z
      const dist = Math.hypot(dx, dz) || 1
      bot.yaw = Math.atan2(dx, dz)
      bot.x += (dx / dist) * 4.4 * dt
      bot.z += (dz / dist) * 4.4 * dt
      bot.y = owner.y
      bot.cool -= dt
      if (dist < 2.2 && bot.cool <= 0) {
        bot.cool = 0.65
        damage(owner, 14, bot.name, null)
      }
      continue
    }
    const foes = []
    if (bot.team === 'ally') {
      for (const other of bots) if (other.team === 'enemy' && other.alive) foes.push(other)
    } else if (bot.team === 'enemy') {
      for (const player of players.values()) if (player.alive && !player.inPit && !player.indoors) foes.push(player)
      for (const other of bots) if (other.team === 'ally' && other.alive) foes.push(other)
    }
    let nearest = null
    let best = 42
    for (const foe of foes) {
      const dist = Math.hypot(foe.x - bot.x, foe.z - bot.z)
      if (dist < best) {
        best = dist
        nearest = foe
      }
    }
    if (nearest) {
      const dx = nearest.x - bot.x
      const dz = nearest.z - bot.z
      const len = Math.hypot(dx, dz) || 1
      bot.yaw = Math.atan2(dx, dz)
      const step = bot.shape === 'bug' ? 1.15 : 3.1
      bot.x += (dx / len) * step * dt
      bot.z += (dz / len) * step * dt
      bot.cool -= dt
      if (best < 34 && bot.cool <= 0) {
        const hunter = bot.team === 'ally' && bot.shape === 'bug'
        bot.cool = hunter ? 0.45 : bot.team === 'ally' ? 0.7 : 0.55
        const chance = hunter ? (best < 8 ? 0.62 : best < 18 ? 0.4 : 0.2) : best < 8 ? 0.5 : best < 18 ? 0.28 : 0.12
        const bite = bot.team === 'enemy' ? 8 : hunter ? 12 : 10
        if (Math.random() < chance) strike(nearest, bite, bot.name, null)
      }
    } else {
      bot.x += Math.sin(Date.now() / 700 + bot.homeX) * 0.4 * dt
      bot.z += Math.cos(Date.now() / 900 + bot.homeZ) * 0.4 * dt
    }
    bot.y = surface(bot.x, bot.z) + 1.7
  }
  for (let i = bots.length - 1; i >= 0; i--) {
    if (bots[i].team === 'mimic' && !bots[i].alive) bots.splice(i, 1)
  }
  movePets(dt)
  for (const trap of traps) {
    if (trap.armed) continue
    trap.cool -= dt
    if (trap.cool <= 0) trap.armed = true
  }
  for (const ride of vehicles) {
    if (!ride.alive) {
      ride.respawn -= dt
      if (ride.respawn <= 0) {
        const parked = vehicles.filter(item => item.kind === 'plane')
        const spot = ride.kind === 'ship'
          ? waterSpot()
          : ride.kind === 'plane'
            ? airportSpot(Math.max(0, parked.indexOf(ride)))
            : scatter()
        ride.alive = true
        ride.hp = ride.maxHp
        ride.x = spot.x
        ride.y = spot.y
        ride.z = spot.z
        ride.driver = null
      }
    }
  }
  for (const player of players.values()) {
    if (!player.alive) {
      player.respawn -= dt
      if (player.respawn <= 0) {
        player.alive = true
        player.hp = 100
        player.x = 8
        player.y = 48
        player.z = 8
      }
    }
    if (Math.hypot(player.x - springSite.x, player.z - springSite.z) < 3.6) {
      if (!player.alive) {
        player.alive = true
        player.hp = 100
        player.respawn = 0
        send(player.socket, { type: 'feed', text: '复活泉水把你拉了回来' })
      } else if (player.hp < 100) {
        player.hp = Math.min(100, player.hp + 4)
      }
    }
  }
  const packet = {
    type: 'snapshot',
    players: [...players.values()].map(poseOf),
    bots: [...bots, ...pets].map(bot => ({
      id: bot.id,
      name: bot.name,
      x: bot.x,
      y: bot.y,
      z: bot.z,
      yaw: bot.yaw,
      hp: bot.hp,
      maxHp: bot.maxHp,
      alive: bot.alive,
      kind: 'bot',
      team: bot.team,
      shape: bot.shape || (bot.team === 'enemy' ? 'bug' : 'person'),
      level: bot.level || 0,
      lead: !!bot.lead
    })),
    pickups: pickups.map(item => ({ id: item.id, kind: item.kind, x: item.x, y: item.y, z: item.z })),
    traps: traps.filter(trap => trap.armed).map(trap => ({ x: trap.x, z: trap.z, y: surface(trap.x, trap.z) + 0.55 })),
    vehicles: vehicles.filter(ride => ride.alive).map(ride => ({
      id: ride.id,
      kind: ride.kind,
      name: ride.name,
      speed: ride.speed,
      x: ride.x,
      y: ride.y,
      z: ride.z,
      yaw: ride.yaw,
      hp: ride.hp,
      maxHp: ride.maxHp,
      driver: ride.driver
    })),
    ally: bots.filter(bot => bot.team === 'ally' && bot.alive).length + [...players.values()].filter(player => player.alive).length,
    enemy: bots.filter(bot => bot.team === 'enemy' && bot.alive).length
  }
  if (pickups.filter(item => item.kind !== 'coin').length < 5) dropLoot()
  if (pickups.filter(item => item.kind === 'coin').length < 5) dropCoin()
  for (const player of players.values()) {
    send(player.socket, {
      ...packet,
      hp: player.hp,
      money: player.money,
      gold: player.gold,
      diamond: player.diamond,
      feed: player.feed,
      skin: player.skin,
      skins: player.skins,
      vest: !!player.vest,
      drum: !!player.drum,
      glass: !!player.glass
    })
  }
}

function shoot(player, msg) {
  const gun = weapons[msg.weapon] || weapons.rifle
  const now = Date.now()
  if (now - player.lastShot < gun.delay * 1000 * 0.85) return
  if (!player.alive) return
  player.lastShot = now
  const origin = { x: player.x, y: player.y, z: player.z }
  const dx = Number.isFinite(Number(msg.dx)) ? Number(msg.dx) : 0
  const dy = Number.isFinite(Number(msg.dy)) ? Number(msg.dy) : 0
  const dz = Number.isFinite(Number(msg.dz)) ? Number(msg.dz) : 0
  const len = Math.hypot(dx, dy, dz) || 1
  const look = { x: dx / len, y: dy / len, z: dz / len }
  const pellets = gun.pellets || 1
  const victims = [...players.values()].filter(other => other.id !== player.id && other.alive)
  victims.push(...bots.filter(bot => bot.alive))
  for (let pellet = 0; pellet < pellets; pellet++) {
    let closest = null
    let closestDist = gun.range
    for (const target of victims) {
      const vx = target.x - origin.x
      const vy = target.y - origin.y
      const vz = target.z - origin.z
      const dist = Math.hypot(vx, vy, vz)
      if (dist > gun.range || dist < 0.4) continue
      const dot = (vx * look.x + vy * look.y + vz * look.z) / dist
      const allowance = gun.pellets ? 0.72 : 0.9
      if (dot > allowance && dist < closestDist) {
        closest = target
        closestDist = dist
      }
    }
    if (closest && closest.team !== 'ally' && closest.team !== 'pet') strike(closest, gun.damage, player.name, player)
  }
}

function explode(player, msg) {
  const x = Number(msg.x)
  const z = Number(msg.z)
  if (!Number.isFinite(x) || !Number.isFinite(z)) return
  if (Math.hypot(player.x - x, player.z - z) > 18) return
  for (const bot of bots) {
    if (!bot.alive) continue
    if (bot.team !== 'enemy' && bot.team !== 'mimic' && bot.shape !== 'squid') continue
    if (Math.hypot(bot.x - x, bot.z - z) < 7) damage(bot, 36, player.name, player)
  }
  broadcast({ type: 'feed', text: `${player.name} 扔出了手榴弹` })
}

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.woff2': 'font/woff2'
}

async function serveRoot(res, root, pathname) {
  const rel = pathname.replace(/^\/+/, '') || 'index.html'
  const file = normalize(join(root, rel))
  if (!file.startsWith(root)) {
    res.writeHead(403)
    res.end('no')
    return
  }
  const body = await readFile(file)
  res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' })
  res.end(body)
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://localhost')
    const path = decodeURIComponent(url.pathname)
    if (path === '/battle' || path.startsWith('/battle/')) {
      const rest = path.slice('/battle'.length) || '/'
      await serveRoot(res, arenaRoot, rest === '/' ? '/index.html' : rest)
      return
    }
    await serveRoot(res, towerRoot, path === '/' ? '/index.html' : path)
  } catch {
    res.writeHead(404)
    res.end('missing')
  }
})

const wss = new WebSocketServer({ server, path: '/arena' })
wss.on('connection', socket => {
  const id = Math.random().toString(36).slice(2, 8)
  const player = {
    id,
    name: names[players.size % names.length] + id.slice(0, 2),
    socket,
    x: 8,
    y: 48,
    z: 8,
    yaw: 0,
    hp: 100,
    alive: true,
    respawn: 0,
    lastShot: 0,
    vest: false,
    drum: false,
    glass: false,
    money: 0,
    gold: 0,
    diamond: 0,
    feed: 0,
    mined: new Set(),
    vehicle: null,
    flying: false,
    swimming: false,
    fishLevel: 1,
    eaten: 0,
    inPit: false,
    indoors: false,
    returnX: 8,
    returnZ: 8,
    skin: 'knight',
    skins: ['knight'],
    team: 'ally'
  }
  players.set(id, player)
  send(socket, { type: 'welcome', id, name: player.name, seed })
  send(socket, { type: 'feed', text: `${player.name} 进入了方块战场` })
  socket.on('message', raw => {
    let msg
    try {
      msg = JSON.parse(String(raw))
    } catch {
      return
    }
    if (msg.type === 'pose') {
      if (Number.isFinite(Number(msg.x))) player.x = Number(msg.x)
      if (Number.isFinite(Number(msg.y))) player.y = Number(msg.y)
      if (Number.isFinite(Number(msg.z))) player.z = Number(msg.z)
      if (Number.isFinite(Number(msg.yaw))) player.yaw = Number(msg.yaw)
      if (Number.isFinite(Number(msg.dx))) player.dx = Number(msg.dx)
      if (Number.isFinite(Number(msg.dy))) player.dy = Number(msg.dy)
      if (Number.isFinite(Number(msg.dz))) player.dz = Number(msg.dz)
      if (player.vehicle) {
        const ride = vehicles.find(item => item.id === player.vehicle && item.alive)
        if (ride) {
          ride.x = player.x
          ride.z = player.z
          if (ride.kind === 'ship') ride.y = SEA + 0.7
          else if (ride.kind === 'plane') {
            player.flying = !!msg.flying
            ride.y = player.flying ? player.y - 1.3 : surface(Math.round(player.x), Math.round(player.z)) + 0.9
          } else ride.y = surface(Math.round(player.x), Math.round(player.z)) + 0.45
          ride.yaw = player.yaw
        }
      } else player.flying = false
    } else if (msg.type === 'crash') {
      const ride = vehicles.find(item => item.id === player.vehicle && item.alive && item.kind === 'plane')
      if (ride && ride.driver === player.id) {
        player.flying = false
        ride.hp -= 70
        if (ride.hp <= 0) wreck(ride)
        else send(socket, { type: 'feed', text: '重着陆，飞机受损' })
      }
    } else if (msg.type === 'swim') {
      if (msg.on) {
        const wet = surface(Math.round(player.x), Math.round(player.z)) < SEA + 0.2
        const ridingShip = player.vehicle
          ? vehicles.some(item => item.id === player.vehicle && item.kind === 'ship')
          : false
        if (!player.alive || player.inPit || player.indoors || player.flying || ridingShip || !wet) return
        player.swimming = true
        send(player.socket, { type: 'fish', level: player.fishLevel, eaten: player.eaten, name: fishTitle(player.fishLevel), grew: false })
      } else if (player.swimming) shoreOut(player, 'land')
    } else if (msg.type === 'enterpit') {
      if (!player.inPit && !player.indoors && !player.swimming && player.alive && !player.vehicle) {
        for (const trap of traps) {
          if (!trap.armed) continue
          if (Math.hypot(player.x - trap.x, player.z - trap.z) < 3.6) {
            enterPit(player, trap)
            break
          }
        }
      }
    } else if (msg.type === 'indoors') {
      player.indoors = !!msg.on
    } else if (msg.type === 'drive') {
      if (player.vehicle) {
        const ride = vehicles.find(item => item.id === player.vehicle)
        if (ride && ride.driver === player.id) ride.driver = null
        player.vehicle = null
        player.flying = false
        send(socket, { type: 'drive', id: null })
        return
      }
      const ride = vehicles.find(item => item.id === msg.id && item.alive && !item.driver)
      if (!ride || !player.alive || Math.hypot(player.x - ride.x, player.z - ride.z) > 3.6) {
        send(socket, { type: 'feed', text: '靠近飞机、船或车再开' })
        return
      }
      ride.driver = player.id
      player.vehicle = ride.id
      ride.yaw = player.yaw || ride.yaw
      send(socket, { type: 'drive', id: ride.id, kind: ride.kind, speed: ride.speed, name: ride.name })
    } else if (msg.type === 'shot') shoot(player, msg)
    else if (msg.type === 'grenade') explode(player, msg)
    else if (msg.type === 'gear') player.vest = !!msg.vest
    else if (msg.type === 'pickup') {
      const index = pickups.findIndex(item => item.id === msg.id)
      if (index < 0) return
      const item = pickups[index]
      if (Math.hypot(player.x - item.x, player.z - item.z) > 3.2) return
      pickups.splice(index, 1)
      if (item.kind === 'coin') {
        const worth = item.worth || 15
        player.money += worth
        send(socket, walletOf(player, { item: 'coin' }))
        send(socket, { type: 'feed', text: `捡到金币 +${worth}` })
        return
      }
      send(socket, { type: 'loot', kind: item.kind })
    } else if (msg.type === 'ore') {
      const x = Math.round(Number(msg.x))
      const y = Math.round(Number(msg.y))
      const z = Math.round(Number(msg.z))
      const ore = findOre(x, y, z)
      if (!ore || ore.kind !== msg.kind || Math.hypot(player.x - x, player.z - z) > 8) {
        send(socket, { type: 'feed', text: '这块矿挖不下来' })
        return
      }
      const key = `${x}_${y}_${z}`
      if (player.mined.has(key)) return
      player.mined.add(key)
      if (ore.kind === 'gold') player.gold += 1
      else player.diamond += 1
      send(socket, walletOf(player, { item: ore.kind }))
      send(socket, { type: 'feed', text: ore.kind === 'gold' ? '挖到金矿。打开商店可以卖掉，或直接当钱花' : '挖到钻石，打开商店可以卖掉' })
    } else if (msg.type === 'feedpet') {
      const pet = pets.find(item => item.id === msg.id)
      if (!pet || Math.hypot(player.x - pet.x, player.z - pet.z) > 4.2) {
        send(socket, { type: 'feed', text: '再靠近狐狸一点' })
        return
      }
      if (player.feed < 1) {
        send(socket, { type: 'feed', text: '没有饲料。商店里可以用钱或一块金矿买' })
        return
      }
      player.feed -= 1
      pet.lead = true
      send(socket, walletOf(player, { item: 'feedpet' }))
      broadcast({ type: 'feed', text: `${pet.name} 吃饱了，跟着它去隐藏的泉水` })
    } else if (msg.type === 'buy' && msg.item === 'sell-gold') {
      if (player.gold < 1) {
        denyShop(player, '没有金矿')
        return
      }
      player.gold -= 1
      player.money += oreValue.gold
      send(socket, walletOf(player, { item: 'sell-gold', shop: true }))
      send(socket, { type: 'feed', text: `卖掉金矿，钱 +${oreValue.gold}` })
    } else if (msg.type === 'buy' && msg.item === 'sell-gold-all') {
      if (player.gold < 1) {
        denyShop(player, '没有金矿')
        return
      }
      const count = player.gold
      player.money += count * oreValue.gold
      player.gold = 0
      send(socket, walletOf(player, { item: 'sell-gold-all', shop: true }))
      send(socket, { type: 'feed', text: `卖掉 ${count} 块金矿，钱 +${count * oreValue.gold}` })
    } else if (msg.type === 'buy' && msg.item === 'sell-diamond') {
      if (player.diamond < 1) {
        denyShop(player, '没有钻石')
        return
      }
      player.diamond -= 1
      player.money += oreValue.diamond
      send(socket, walletOf(player, { item: 'sell-diamond', shop: true }))
      send(socket, { type: 'feed', text: `卖掉钻石，钱 +${oreValue.diamond}` })
    } else if (msg.type === 'buy' && msg.item === 'sell-diamond-all') {
      if (player.diamond < 1) {
        denyShop(player, '没有钻石')
        return
      }
      const count = player.diamond
      player.money += count * oreValue.diamond
      player.diamond = 0
      send(socket, walletOf(player, { item: 'sell-diamond-all', shop: true }))
      send(socket, { type: 'feed', text: `卖掉 ${count} 颗钻石，钱 +${count * oreValue.diamond}` })
    } else if (msg.type === 'buy' && msg.item === 'feed') {
      const goldPrice = 1
      if (!chargePlayer(player, msg, prices.feed, goldPrice)) {
        denyShop(player, msg.pay === 'gold' ? '没有金矿换饲料' : '钱不够买饲料')
        return
      }
      player.feed += 1
      send(socket, walletOf(player, { item: 'feed', shop: true }))
      send(socket, { type: 'feed', text: '买到饲料' })
    } else if (msg.type === 'buy' && typeof msg.item === 'string' && msg.item.startsWith('skin-')) {
      const id = msg.item.slice(5)
      const skin = skins.find(item => item.id === id)
      if (!skin) return
      if (!player.skins.includes(id)) {
        if (!chargePlayer(player, msg, skin.price, skin.price > 0 ? goldCost(skin.price) : 0)) {
          denyShop(player, msg.pay === 'gold' ? '金矿不够换这个小人' : '钱不够换这个小人')
          return
        }
        player.skins.push(id)
      }
      player.skin = id
      send(socket, walletOf(player, { item: msg.item, shop: true }))
      send(socket, { type: 'feed', text: `换成了${skin.name}` })
    } else if (msg.type === 'buy') {
      const price = prices[msg.item]
      if (!price) return
      if (msg.item === 'vest' && player.vest) {
        denyShop(player, '已经穿着背心')
        return
      }
      if (msg.item === 'drum' && player.drum) {
        denyShop(player, '弹匣已经买过了')
        return
      }
      if (msg.item === 'glass' && player.glass) {
        denyShop(player, '稳镜已经买过了')
        return
      }
      if (msg.item === 'bug' && bots.filter(bot => bot.hired).length >= 6) {
        denyShop(player, '虫友已经够多了')
        return
      }
      if (!chargePlayer(player, msg, price, goldCost(price))) {
        denyShop(player, msg.pay === 'gold' ? '金矿不够' : '钱不够')
        return
      }
      if (msg.item === 'bug') spawnAllyBug(player)
      if (msg.item === 'vest') player.vest = true
      if (msg.item === 'drum') player.drum = true
      if (msg.item === 'glass') player.glass = true
      if (msg.item === 'med') player.hp = Math.min(100, player.hp + 45)
      const notes = {
        vest: '穿上背心，挨打会轻一些',
        drum: '弹匣变大了',
        glass: '瞄准更稳了',
        med: '治疗了',
        grenade: '买到一颗手榴弹'
      }
      send(socket, walletOf(player, { item: msg.item, shop: true }))
      if (notes[msg.item]) send(socket, { type: 'feed', text: notes[msg.item] })
    }
    else if (msg.type === 'alive') {
      player.alive = true
      player.hp = 100
    }
  })
  socket.on('close', () => {
    players.delete(id)
    broadcast({ type: 'feed', text: `${player.name} 离开了` })
  })
})

let last = Date.now()
setInterval(() => {
  const now = Date.now()
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  tick(dt)
}, 100)

server.listen(PORT, '0.0.0.0', () => {
  console.log('voxel arena on ' + PORT + ' seed ' + seed)
})
