export type FighterState = {
  id: string
  name: string
  x: number
  y: number
  z: number
  yaw: number
  hp: number
  maxHp?: number
  alive: boolean
  kind: 'player' | 'bot'
  team?: 'ally' | 'enemy' | 'pet' | 'beast' | 'mimic' | 'fish'
  shape?: 'bug' | 'person' | 'sheep' | 'rabbit' | 'fox' | 'squid' | 'mimic' | 'fish'
  level?: number
  lead?: boolean
}

export type Pickup = { id: string; kind: string; x: number; y: number; z: number }

export type TrapMark = { x: number; y: number; z: number }

export type Ride = {
  id: string
  kind: 'bike' | 'car' | 'ship' | 'plane'
  name: string
  speed: number
  x: number
  y: number
  z: number
  yaw: number
  hp: number
  maxHp: number
  driver: string | null
}

type Handler = {
  onWelcome?: (seed: number, id: string, name: string) => void
  onSnapshot?: (players: FighterState[], bots: FighterState[], hp: number) => void
  onFeed?: (text: string) => void
  onDown?: () => void
  onLoot?: (kind: string) => void
  onWallet?: (money: number, item?: string, shop?: boolean) => void
  onDrive?: (id: string | null, kind?: 'bike' | 'car' | 'ship' | 'plane', speed?: number, name?: string) => void
  onEject?: () => void
  onPit?: () => void
  onSurface?: (x: number, y: number, z: number) => void
  onFish?: (level: number, eaten: number, name: string, grew: boolean) => void
  onAshore?: (x: number, y: number, z: number, reason: string, allies: number) => void
}

export const arena = {
  id: '',
  name: '',
  seed: null as number | null,
  hp: 100,
  money: 0,
  gold: 0,
  diamond: 0,
  feed: 0,
  vest: false,
  drum: false,
  glass: false,
  skin: 'knight',
  skins: ['knight'] as string[],
  ally: 1,
  enemy: 0,
  pickups: [] as Pickup[],
  traps: [] as TrapMark[],
  vehicles: [] as Ride[],
  players: [] as FighterState[],
  bots: [] as FighterState[],
  ws: null as WebSocket | null,
  handlers: {} as Handler,

  connect() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket = new WebSocket(`${proto}//${location.host}/arena`)
    this.ws = socket
    socket.addEventListener('message', event => {
      const msg = JSON.parse(String(event.data)) as {
        type: string
        seed?: number
        id?: string
        name?: string
        players?: FighterState[]
        bots?: FighterState[]
        hp?: number
        text?: string
        money?: number
        ally?: number
        enemy?: number
        pickups?: Pickup[]
        traps?: TrapMark[]
        vehicles?: Ride[]
        x?: number
        y?: number
        z?: number
        kind?: string
        speed?: number
        driver?: string | null
        item?: string
        shop?: boolean
        fail?: boolean
        gold?: number
        diamond?: number
        feed?: number
        skin?: string
        skins?: string[]
        vest?: boolean
        drum?: boolean
        glass?: boolean
        level?: number
        eaten?: number
        grew?: boolean
        reason?: string
        allies?: number
      }
      if (msg.type === 'welcome' && typeof msg.seed === 'number' && msg.id && msg.name) {
        this.id = msg.id
        this.name = msg.name
        this.seed = msg.seed
        ;(window as unknown as { __arenaSeed?: number }).__arenaSeed = msg.seed
        this.handlers.onWelcome?.(msg.seed, msg.id, msg.name)
      } else if (msg.type === 'snapshot') {
        this.players = msg.players || []
        this.bots = msg.bots || []
        if (typeof msg.hp === 'number') this.hp = msg.hp
        if (typeof msg.money === 'number') this.money = msg.money
        if (typeof msg.gold === 'number') this.gold = msg.gold
        if (typeof msg.diamond === 'number') this.diamond = msg.diamond
        if (typeof msg.feed === 'number') this.feed = msg.feed
        if (typeof msg.skin === 'string') this.skin = msg.skin
        if (Array.isArray(msg.skins)) this.skins = msg.skins
        if (typeof msg.vest === 'boolean') this.vest = msg.vest
        if (typeof msg.drum === 'boolean') this.drum = msg.drum
        if (typeof msg.glass === 'boolean') this.glass = msg.glass
        if (typeof msg.ally === 'number') this.ally = msg.ally
        if (typeof msg.enemy === 'number') this.enemy = msg.enemy
        if (msg.pickups) this.pickups = msg.pickups
        if (msg.traps) this.traps = msg.traps
        if (msg.vehicles) this.vehicles = msg.vehicles
        this.handlers.onSnapshot?.(this.players, this.bots, this.hp)
      } else if (msg.type === 'feed' && msg.text) {
        this.handlers.onFeed?.(msg.text)
      } else if (msg.type === 'down') {
        this.handlers.onDown?.()
      } else if (msg.type === 'loot' && msg.kind) {
        this.handlers.onLoot?.(msg.kind)
      } else if (msg.type === 'wallet' && typeof msg.money === 'number') {
        this.money = msg.money
        if (typeof msg.gold === 'number') this.gold = msg.gold
        if (typeof msg.diamond === 'number') this.diamond = msg.diamond
        if (typeof msg.feed === 'number') this.feed = msg.feed
        if (typeof msg.skin === 'string') this.skin = msg.skin
        if (Array.isArray(msg.skins)) this.skins = msg.skins
        if (typeof msg.vest === 'boolean') this.vest = msg.vest
        if (typeof msg.drum === 'boolean') this.drum = msg.drum
        if (typeof msg.glass === 'boolean') this.glass = msg.glass
        this.handlers.onWallet?.(msg.money, msg.item, msg.shop)
      } else if (msg.type === 'drive') {
        this.handlers.onDrive?.(msg.id ?? null, msg.kind as 'bike' | 'car' | 'ship' | 'plane' | undefined, msg.speed, msg.name)
      } else if (msg.type === 'eject') {
        this.handlers.onEject?.()
      } else if (msg.type === 'pit') {
        this.handlers.onPit?.()
      } else if (msg.type === 'surface' && typeof msg.x === 'number' && typeof msg.y === 'number' && typeof msg.z === 'number') {
        this.handlers.onSurface?.(msg.x, msg.y, msg.z)
      } else if (msg.type === 'fish' && typeof msg.level === 'number') {
        this.handlers.onFish?.(msg.level, msg.eaten || 0, msg.name || '', !!msg.grew)
      } else if (msg.type === 'ashore' && typeof msg.x === 'number' && typeof msg.y === 'number' && typeof msg.z === 'number') {
        this.handlers.onAshore?.(msg.x, msg.y, msg.z, msg.reason || 'land', msg.allies || 0)
      }
    })
  },

  send(data: unknown) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(data))
  }
}
