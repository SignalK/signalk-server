import { expect } from 'chai'
import { getMetadata, metadataRegistry } from './index'

// Callers always prefix the Signal K context, e.g. `vessels.self.<path>`.
const self = (p: string) => `vessels.self.${p}`

describe('getMetadata', () => {
  beforeEach(() => {
    // The registry is a module singleton; addMetaData calls below would
    // otherwise leak state into subsequent tests.
    metadataRegistry.reset()
  })

  describe('wildcard (RegExp) entries must not match non-spec descendants', () => {
    // /vessels/*/electrical/ac/RegExp defines the shape of a named AC bus
    // (bus1, bus2, …). A plugin-invented path like
    // electrical.ac.totalCurrent is not part of the Signal K spec and must
    // NOT inherit the bus-level description; otherwise the UI shows "AC Bus,
    // one or many, within the vessel" on a path that is not a bus.
    it('electrical.ac.totalCurrent returns no metadata', () => {
      expect(getMetadata(self('electrical.ac.totalCurrent'))).to.equal(
        undefined
      )
    })

    // Parent entries that only carry child descriptions should not attach
    // themselves to non-spec siblings either.
    it('environment.refrigerator.temperature returns no wildcard inheritance', () => {
      const meta = getMetadata(self('environment.refrigerator.temperature'))
      if (meta && typeof meta === 'object') {
        expect(meta.description ?? '').to.not.match(/one or many/i)
      }
    })
  })

  describe('specific spec entries still match', () => {
    it('electrical.batteries.0.capacity.stateOfCharge returns the spec-defined entry', () => {
      const meta = getMetadata(
        self('electrical.batteries.0.capacity.stateOfCharge')
      )
      expect(meta).to.not.equal(undefined)
      expect((meta as { units?: string }).units).to.equal('ratio')
    })

    it('electrical.ac.bus1 does not inherit the container-shape description', () => {
      // The RegExp entry /vessels/*/electrical/ac/RegExp is a shape
      // definition for "an AC bus" — not a lookup target. Old schema
      // (v2.25) skipped bare-wildcard entries; the new registry matches
      // that so plugin paths alongside real buses are not mis-labelled.
      expect(getMetadata(self('electrical.ac.bus1'))).to.equal(undefined)
    })
  })

  describe('runtime-added plugin meta survives later lookups', () => {
    // Plugins publish their own metadata via `update.meta`. FullSignalK.addMeta
    // forwards that into metadataRegistry.addMetaData(context, path, value),
    // which must (a) make getMetadata return that value and (b) not be
    // overwritten by a later lookup for the same path.
    it('plugin-supplied meta is returned by getMetadata', () => {
      metadataRegistry.addMetaData('vessels.self', 'plugin.only.path', {
        units: 'V',
        description: 'plugin-only'
      })
      const meta = getMetadata(self('plugin.only.path'))
      expect(meta).to.not.equal(undefined)
      expect((meta as { units?: string }).units).to.equal('V')
      expect((meta as { description?: string }).description).to.equal(
        'plugin-only'
      )
    })

    it('plugin meta merges with, and overrides, a spec entry', () => {
      // electrical.batteries.0.capacity.stateOfCharge has a spec entry with
      // units: 'ratio'. A plugin that reports a different description should
      // end up merging — units stays 'ratio' (plugin did not override it),
      // description becomes the plugin's.
      metadataRegistry.addMetaData(
        'vessels.self',
        'electrical.batteries.0.capacity.stateOfCharge',
        { description: 'Battery charge as a ratio (from plugin)' }
      )
      const meta = getMetadata(
        self('electrical.batteries.0.capacity.stateOfCharge')
      )
      expect(meta).to.not.equal(undefined)
      expect((meta as { units?: string }).units).to.equal('ratio')
      expect((meta as { description?: string }).description).to.equal(
        'Battery charge as a ratio (from plugin)'
      )
    })
  })
})
