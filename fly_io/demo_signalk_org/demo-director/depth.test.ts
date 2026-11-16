import { strict as assert } from 'node:assert'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { gzipSync } from 'node:zlib'
import {
  DEPTH_GRID_DATA,
  DEPTH_GRID_HEADER,
  NO_DEPTH,
  Sounder,
  chartedDepth,
  loadDepthGrid
} from './depth.ts'

// 2 x 2 cells of 0.01 degrees: 5 m and 7 m in the north row, then a
// drying flat at -1 m next to land
const HEADER = {
  west: 5,
  north: 53.02,
  dLon: 0.01,
  dLat: 0.01,
  width: 2,
  height: 2
}
const CM = [500, 700, -100, NO_DEPTH]

function writeGrid() {
  const dir = mkdtempSync(join(tmpdir(), 'depth-grid-'))
  const data = Buffer.alloc(CM.length * 2)
  CM.forEach((cm, i) => data.writeInt16LE(cm, i * 2))
  writeFileSync(join(dir, DEPTH_GRID_HEADER), JSON.stringify(HEADER))
  writeFileSync(join(dir, DEPTH_GRID_DATA), gzipSync(data))
  return dir
}

function near(actual: number | undefined, expected: number) {
  assert.ok(
    actual !== undefined && Math.abs(actual - expected) < 1e-6,
    `${actual} is not ${expected}`
  )
}

describe('depth grid', () => {
  const grid = loadDepthGrid(writeGrid())!

  it('reads the charted depth at a cell centre', () => {
    near(chartedDepth(grid, 53.015, 5.005), 5)
    near(chartedDepth(grid, 53.015, 5.015), 7)
    near(chartedDepth(grid, 53.005, 5.005), -1)
  })

  it('interpolates between cell centres', () => {
    near(chartedDepth(grid, 53.015, 5.01), 6)
  })

  it('leaves land out of the interpolation', () => {
    near(chartedDepth(grid, 53.01, 5.01), 11 / 3)
  })

  it('has no depth off the chart', () => {
    assert.equal(chartedDepth(grid, 52, 5.005), undefined)
  })

  it('is missing without the build asset', () => {
    assert.equal(loadDepthGrid(tmpdir() + '/no-such-grid'), undefined)
  })
})

describe('sounder', () => {
  const still = () => 0.5

  it('adds the tide to the charted depth', () => {
    near(new Sounder(still).next(5, 1.2, 1), 6.2)
  })

  it('reads 0 over a flat that dries', () => {
    assert.equal(new Sounder(still).next(-1, 0.4, 1), 0)
  })

  it('settles towards a new depth instead of jumping', () => {
    const sounder = new Sounder(still)
    sounder.next(5, 0, 1)
    const after = sounder.next(10, 0, 1)
    assert.ok(after > 5 && after < 7)
  })

  it('wanders by at most 5 cm', () => {
    near(new Sounder(() => 1).next(5, 0, 1), 5.05)
    near(new Sounder(() => 0).next(5, 0, 1), 4.95)
  })
})
