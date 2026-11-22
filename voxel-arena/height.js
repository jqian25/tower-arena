// Keep the early returns aligned with biomeAt in src/world/biome.ts.
// noiseValue is the raw ImprovedNoise sample, roughly -1 to 1.
export function terrainHeight(x, z, noiseValue) {
  const raw = 30 + Math.floor(noiseValue * 8)
  if (x > 110 && z < -110) return raw
  if (x > 80 && z > -70 && z < 90) return raw
  if (z < -100) return raw
  if (x < -100) return raw
  if (z <= 64) return raw
  const blend = Math.min(1, (z - 64) / 32)
  return Math.round(raw + (22 - raw) * blend)
}
