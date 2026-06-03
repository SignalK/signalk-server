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

  describe('runtime meta is resolvable across contexts (path-keyed)', () => {
    // Regression: the FreeboardSK server plugin registers environment-path
    // metas under context 'meteo', but values for the same path can arrive
    // under a different context — e.g. an AIS target under vessels.<mmsi>.
    // Metadata describes the path, not the vessel, so it must resolve
    // regardless of which context registered it.
    it('meta added under "meteo" resolves for a value under "vessels"', () => {
      metadataRegistry.addMetaData('meteo', 'environment.water.level', {
        units: 'm',
        description: 'Water level.'
      })

      // via getMetadata (used by the WS meta channel and /paths)
      const viaGet = getMetadata(
        'vessels.urn:mrn:imo:mmsi:123456789.environment.water.level'
      )
      expect(viaGet).to.not.equal(undefined)
      expect((viaGet as { units?: string }).units).to.equal('m')
      expect((viaGet as { description?: string }).description).to.equal(
        'Water level.'
      )

      // via internalGetMetadata (used by FullSignalK on the first value)
      const viaInternal = metadataRegistry.internalGetMetadata(
        'vessels.urn:mrn:imo:mmsi:123456789.environment.water.level'
      )
      expect(viaInternal).to.not.equal(undefined)
      expect((viaInternal as { units?: string }).units).to.equal('m')
    })

    it('also resolves under the original "meteo" context', () => {
      metadataRegistry.addMetaData('meteo', 'environment.water.level', {
        units: 'm',
        description: 'Water level.'
      })
      const meta = getMetadata(
        'meteo.urn:mrn:signalk:uuid:abc.environment.water.level'
      )
      expect((meta as { units?: string }).units).to.equal('m')
    })

    it('does not bleed onto a different path', () => {
      metadataRegistry.addMetaData('meteo', 'environment.water.level', {
        units: 'm',
        description: 'Water level.'
      })
      // A different path under the same context root is unaffected.
      expect(
        getMetadata('vessels.self.environment.depth.belowTransducer')
      ).to.not.have.property('description', 'Water level.')
      // A truncated path (bare water.level) must not match the full path.
      expect(getMetadata('vessels.self.water.level')).to.equal(undefined)
    })

    it('a description-only foreign-context meta keeps the spec units', () => {
      // The path-keyed /*/*/ entry sits at the front of the lookup array,
      // so a foreign-context (e.g. 'meteo') meta that only sets description
      // must still seed from the vessel spec template — otherwise it would
      // shadow the /vessels/*/ spec wildcard and strip the spec units from
      // the same path under every context.
      metadataRegistry.addMetaData(
        'meteo',
        'electrical.batteries.0.capacity.stateOfCharge',
        { description: 'state of charge (from meteo plugin)' }
      )
      const meta = getMetadata(
        self('electrical.batteries.0.capacity.stateOfCharge')
      )
      expect(meta).to.not.equal(undefined)
      expect((meta as { units?: string }).units).to.equal('ratio')
      expect((meta as { description?: string }).description).to.equal(
        'state of charge (from meteo plugin)'
      )
    })
  })
})
