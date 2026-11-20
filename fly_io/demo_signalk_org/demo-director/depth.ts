// The demo boat has no echo sounder, so the director sounds the chart: the
// build grids the depth areas and soundings of the ENC cells (charted
// depth below chart datum, in cm, negative where the flats dry), and the
// water depth under the boat is that plus the tide height.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'

export const DEPTH_GRID_HEADER = 'depth-grid.json'
export const DEPTH_GRID_DATA = 'depth-grid.bin.gz'
// a cell the ENC charts as land, or does not cover
export const NO_DEPTH = -32768
// the sounder settles like a real one rather than jumping cell to cell
const SETTLE_S = 4
const NOISE_M = 0.05

export interface DepthGrid {
  west: number
  north: number
  // cell size in degrees
  dLon: number
  dLat: number
  width: number
  height: number
  // row by row from the north-west corner, little-endian int16 cm
  cm: Int16Array
}

export function loadDepthGrid(dir: string): DepthGrid | undefined {
  let header: Omit<DepthGrid, 'cm'>
  let data: Buffer
  try {
    header = JSON.parse(readFileSync(join(dir, DEPTH_GRID_HEADER), 'utf8'))
    data = gunzipSync(readFileSync(join(dir, DEPTH_GRID_DATA)))
  } catch {
    return undefined
  }
  const cm = new Int16Array(header.width * header.height)
  for (let i = 0; i < cm.length; i++) cm[i] = data.readInt16LE(i * 2)
  return { ...header, cm }
}

// Charted depth in metres at a position, interpolated between the four
// surrounding cell centres that are water; undefined over land or off the
// chart.
export function chartedDepth(
  grid: DepthGrid,
  latitude: number,
  longitude: number
): number | undefined {
  if (
    longitude < grid.west ||
    longitude > grid.west + grid.width * grid.dLon ||
    latitude > grid.north ||
    latitude < grid.north - grid.height * grid.dLat
  )
    return undefined
  const x = (longitude - grid.west) / grid.dLon - 0.5
  const y = (grid.north - latitude) / grid.dLat - 0.5
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  let sum = 0
  let weights = 0
  for (const [dx, dy] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1]
  ]) {
    const cx = x0 + dx
    const cy = y0 + dy
    if (cx < 0 || cy < 0 || cx >= grid.width || cy >= grid.height) continue
    const value = grid.cm[cy * grid.width + cx]
    if (value === NO_DEPTH) continue
    const weight = (1 - Math.abs(x - cx)) * (1 - Math.abs(y - cy))
    sum += (weight * value) / 100
    weights += weight
  }
  return weights > 0 ? sum / weights : undefined
}

export class Sounder {
  private depth: number | undefined
  private readonly random: () => number

  constructor(random = Math.random) {
    this.random = random
  }

  // Water depth below the surface, never below 0 where the flats dry
  next(charted: number, tide: number, dtS: number): number {
    const water = Math.max(0, charted + tide)
    const share = 1 - Math.exp(-dtS / SETTLE_S)
    this.depth =
      this.depth === undefined
        ? water
        : this.depth + (water - this.depth) * share
    const noise = (this.random() * 2 - 1) * NOISE_M
    return Math.max(0, this.depth + noise)
  }

  reset() {
    this.depth = undefined
  }
}
