import { expect } from 'chai'
import fs from 'fs'
import path from 'path'
import { compile } from 'mathjs'
import type { UnitDefinitions } from '../src/unitpreferences/types'

const UNITPREFS_DIR = path.join(__dirname, '../unitpreferences')

// custom-units-definitions.json and custom-categories.json are copied into the
// configuration directory on first start, so whatever ships here becomes the
// starting point of every new installation.
const USER_OWNED_FILES = [
  'custom-units-definitions.json',
  'custom-categories.json'
]

// The duration conversions call formatters that the client evaluating the
// formula supplies. Every other name in a formula has to resolve on its own.
const CLIENT_HELPERS = {
  formatDurationCompact: () => '',
  formatDurationDHMS: () => '',
  formatDurationHMS: () => '',
  formatDurationHMSMillis: () => '',
  formatDurationMS: () => '',
  formatDurationMSMillis: () => '',
  formatDurationVerbose: () => ''
}

const readShipped = (file: string): unknown =>
  JSON.parse(fs.readFileSync(path.join(UNITPREFS_DIR, file), 'utf-8'))

describe('Shipped unit preference files', function () {
  it('has conversion formulas a client can evaluate', function () {
    const definitions = readShipped(
      'standard-units-definitions.json'
    ) as UnitDefinitions
    for (const [siUnit, definition] of Object.entries(definitions)) {
      for (const [targetUnit, conversion] of Object.entries(
        definition.conversions
      )) {
        for (const key of ['formula', 'inverseFormula'] as const) {
          const where = `${siUnit} -> ${targetUnit} ${key}`
          expect(
            () =>
              compile(conversion[key]).evaluate({
                value: 1,
                ...CLIENT_HELPERS
              }),
            where
          ).to.not.throw()
        }
      }
    }
  })

  it('ships the user-owned files empty', function () {
    for (const file of USER_OWNED_FILES) {
      expect(readShipped(file), file).to.deep.equal({})
    }
  })
})
