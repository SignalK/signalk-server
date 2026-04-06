import chai from 'chai'
chai.should()

import { CHART_TILE_REGEX } from '../src/api/resources/index'

const MAX_REGEX_MATCH_MS = 50

describe('Chart tile route regex', () => {
  const tilePaths = [
    '/signalk/v2/api/resources/charts/my-chart/14/8192/5461',
    '/signalk/v2/api/resources/charts/chart-with-dashes/0/0/0',
    '/signalk/v2/api/resources/charts/Provider/ChartName/7/64/42'
  ]

  tilePaths.forEach((path) => {
    it(`should match tile request: ${path}`, () => {
      CHART_TILE_REGEX.test(path).should.equal(true)
    })
  })

  const nonTilePaths = [
    '/signalk/v2/api/resources/charts/my-chart/name',
    '/signalk/v2/api/resources/charts/my-chart/tilemapUrl',
    '/signalk/v2/api/resources/charts/Canary-Cape Verde/Navionics/Z7-18'
  ]

  nonTilePaths.forEach((path) => {
    it(`should not match non-tile request: ${path}`, () => {
      CHART_TILE_REGEX.test(path).should.equal(false)
    })
  })

  // Typically completes in ~1ms. If this gets flaky, 100ms still catches the
  // catastrophic backtracking regression which takes seconds or never finishes.
  it(`should complete in under ${MAX_REGEX_MATCH_MS}ms on paths with multiple segments`, () => {
    const path =
      '/signalk/v2/api/resources/charts/Canary-Cape Verde/Navionics/Z7-18'
    const start = Date.now()
    CHART_TILE_REGEX.test(path)
    const elapsed = Date.now() - start
    elapsed.should.be.below(MAX_REGEX_MATCH_MS)
  })
})
