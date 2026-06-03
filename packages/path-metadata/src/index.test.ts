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

  // Metadata is a PATH-keyed, context-INDEPENDENT namespace: a path's
  // units/description are the same under any context root. The seed is
  // authored as /vessels/*/<path> but must resolve under meteo.<id>,
  // aircraft.<id>, an arbitrary root, etc.
  describe('metadata resolves independently of the context root', () => {
    it('resolves the same spec meta under a non-vessel context', () => {
      const meteo = getMetadata(
        'meteo.urn:mrn:imo:mmsi:002320001.environment.outside.temperature'
      )
      expect((meteo as { units?: string })?.units).to.equal('K')
      const aircraft = getMetadata(
        'aircraft.self.environment.outside.temperature'
      )
      expect((aircraft as { units?: string })?.units).to.equal('K')
    })

    it('resolves spec meta under an entirely arbitrary context root', () => {
      const meta = getMetadata('foobar.self.environment.outside.temperature')
      expect((meta as { units?: string })?.units).to.equal('K')
    })

    it('addMetaData under one context is visible under another', () => {
      metadataRegistry.addMetaData(
        'meteo.x',
        'environment.outside.temperature',
        { description: 'from meteo' }
      )
      const meta = getMetadata(self('environment.outside.temperature'))
      expect((meta as { description?: string }).description).to.equal(
        'from meteo'
      )
      // The spec unit survives because the plugin only set description.
      expect((meta as { units?: string }).units).to.equal('K')
    })

    it('addMetaData ignores the context root for keying', () => {
      // Identity-less context root only — must still populate the path for
      // every context.
      metadataRegistry.addMetaData('meteo', 'plugin.only.path', { units: 'C' })
      const meta = getMetadata(self('plugin.only.path'))
      expect((meta as { units?: string }).units).to.equal('C')
    })

    it('internalGetMetadata shares one clone across contexts', () => {
      const a = metadataRegistry.internalGetMetadata(
        'vessels.self.navigation.speedOverGround'
      )
      const b = metadataRegistry.internalGetMetadata(
        'meteo.x.navigation.speedOverGround'
      )
      expect(a).to.not.equal(undefined)
      expect(a).to.equal(b)
    })
  })

  describe('the /paths view (getAllMetadata) keeps its on-disk shape', () => {
    it('exposes only authored seed keys, not runtime adds', () => {
      const all = metadataRegistry.getAllMetadata()
      // Authored shape PathReference.tsx filters on is unchanged.
      expect(all).to.have.property('/vessels/*/environment/outside/temperature')
      expect(all).to.have.property('/self')
      expect(all).to.have.property('/version')

      // Runtime adds land in the separate runtimeClones map and must NOT
      // leak into /paths under any key.
      metadataRegistry.addMetaData('vessels.self', 'plugin.runtime.path', {
        units: 'V'
      })
      const after = metadataRegistry.getAllMetadata()
      expect(after).to.not.have.property('/*/plugin/runtime/path')
      expect(after).to.not.have.property('/vessels/*/plugin/runtime/path')
    })
  })

  describe('non-context root entries still resolve when looked up bare', () => {
    // /self and /version are not '/<root>/*/<path>'-shaped, so the path-only
    // matcher cannot reach them. getMetadata falls back to a literal lookup
    // so a bare 'self'/'version' still resolves (as on the old schema).
    it('resolves /self and /version by their literal key', () => {
      expect(getMetadata('self')).to.not.equal(undefined)
      expect(getMetadata('version')).to.not.equal(undefined)
    })
  })

  describe('a per-path runtime clone wins over the generic spec wildcard', () => {
    // A value delta clones the spec entry (internalGetMetadata); a later
    // PUT meta override merges into that same clone (addMetaData). The
    // clone's regex must sit ahead of the spec wildcard so getMetadata
    // returns the override, not the untouched spec entry. Regression for
    // the unit-preferences displayUnits override.
    it('returns a later addMetaData override after an earlier value clone', () => {
      const p = 'vessels.self.navigation.speedOverGround'
      // value delta path: clone the spec entry first
      metadataRegistry.internalGetMetadata(p)
      // PUT meta path: merge an override into the same path
      metadataRegistry.addMetaData(
        'vessels.self',
        'navigation.speedOverGround',
        {
          displayUnits: { category: 'speed', targetUnit: 'km/h' }
        }
      )
      const meta = getMetadata(p) as {
        units?: string
        displayUnits?: { targetUnit?: string }
      }
      expect(meta.displayUnits?.targetUnit).to.equal('km/h')
      // The spec unit is preserved through the merge.
      expect(meta.units).to.equal('m/s')
    })
  })
})
