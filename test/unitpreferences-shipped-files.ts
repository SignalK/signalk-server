import { expect } from 'chai'
import fs from 'fs'
import path from 'path'
import { compile } from 'mathjs'
import { getMetadata } from '@signalk/path-metadata'
import type { UnitDefinitions } from '../src/unitpreferences/types'

const UNITPREFS_DIR = path.join(__dirname, '../unitpreferences')

// custom-units-definitions.json is copied into the configuration directory on
// first start, so its sample conversions become the starting point of every new
// installation and have to hold up like the standard ones.
const DEFINITION_FILES = [
  'standard-units-definitions.json',
  'custom-units-definitions.json'
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

// A default category's '*' stands for one path segment, as the loader matches it.
const WILDCARD_INSTANCE = 'main'

interface DefaultCategories {
  categories: Record<string, { siUnit: string; paths?: string[] }>
}

const readShipped = (file: string): unknown =>
  JSON.parse(fs.readFileSync(path.join(UNITPREFS_DIR, file), 'utf-8'))

/**
 * A path's unit from the specification: its own metadata, or for a field of
 * an object value such as `design.length.overall`, the parent's `properties`.
 */
function specifiedUnits(skPath: string): string | undefined {
  const own = getMetadata('vessels.self.' + skPath)?.units
  if (own !== undefined) return own
  const dot = skPath.lastIndexOf('.')
  const parent = getMetadata('vessels.self.' + skPath.slice(0, dot)) as
    { properties?: Record<string, { units?: string }> } | undefined
  return parent?.properties?.[skPath.slice(dot + 1)]?.units
}

describe('Shipped unit preference files', function () {
  it('has conversion formulas a client can evaluate', function () {
    for (const file of DEFINITION_FILES) {
      const definitions = readShipped(file) as UnitDefinitions
      for (const [siUnit, definition] of Object.entries(definitions)) {
        for (const [targetUnit, conversion] of Object.entries(
          definition.conversions
        )) {
          for (const key of ['formula', 'inverseFormula'] as const) {
            const where = `${file}: ${siUnit} -> ${targetUnit} ${key}`
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
    }
  })

  describe('default-categories.json', function () {
    const { categories } = readShipped(
      'default-categories.json'
    ) as DefaultCategories
    // The resolver picks a conversion by categories.json's base unit, not by
    // the siUnit declared here, so paths are checked against the former.
    const { categoryToBaseUnit } = readShipped('categories.json') as {
      categoryToBaseUnit: Record<string, string>
    }
    const entries = Object.entries(categories).flatMap(([category, def]) =>
      (def.paths ?? []).map((p) => ({
        category,
        siUnit: categoryToBaseUnit[category],
        path: p
      }))
    )

    it('declares each category with its base unit', function () {
      const mismatched = Object.entries(categories).flatMap(
        ([category, def]) =>
          def.siUnit === categoryToBaseUnit[category]
            ? []
            : [
                `${category}: ${def.siUnit}, categories.json ${categoryToBaseUnit[category]}`
              ]
      )
      expect(mismatched).to.deep.equal([])
    })

    it('files each path under a category of its specified unit', function () {
      const misfiled = entries.flatMap(({ category, siUnit, path: p }) => {
        const units = specifiedUnits(p.replace(/\*/g, WILDCARD_INSTANCE))
        return units === undefined || units === siUnit
          ? []
          : [`${p}: ${category} (${siUnit}), specified in ${units}`]
      })
      expect(misfiled).to.deep.equal([])
    })

    it('lists each path once', function () {
      const seen = new Map<string, string>()
      const repeated = entries.flatMap(({ category, path: p }) => {
        const first = seen.get(p)
        seen.set(p, first ?? category)
        return first === undefined ? [] : [`${p}: ${first} and ${category}`]
      })
      expect(repeated).to.deep.equal([])
    })
  })
})
