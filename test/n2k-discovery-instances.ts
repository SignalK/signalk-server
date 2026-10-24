import { expect } from 'chai'
import type { N2kInstanceRule } from '@signalk/streams/n2k-instance-groups'
import {
  buildPgnDataInstancesFromTree,
  buildPgnSourceKeysFromTree,
  discoveredInstance
} from '../src/n2k-discovery-instances'
import type { MappedSources } from '../src/n2k-instance-mappings'

// The SK self-vessel tree has paths like
//   electrical.batteries.<n>.voltage = { value, $source }
// Two devices each with their own $source publishing their own
// instance must produce non-overlapping entries — no false conflicts.

describe('buildPgnDataInstancesFromTree', function () {
  it('reads currently-published battery instances per source from the tree', function () {
    const tree = {
      electrical: {
        batteries: {
          '0': {
            voltage: { value: 24.1, $source: 'N2K.lynx-bms' }
          },
          '2': {
            voltage: { value: 13.8, $source: 'N2K.virtual-battery' }
          }
        }
      }
    }
    const out = buildPgnDataInstancesFromTree(tree)
    expect(out).to.have.property('N2K.lynx-bms')
    expect(out).to.have.property('N2K.virtual-battery')
    // PGN 127508 paths share electrical.batteries.<n> with 127506 and
    // 127513, so the helper credits all three to whoever publishes the
    // path. That's fine for conflict detection — those PGNs all share
    // the same primary key (instance) and would conflict together.
    expect(out['N2K.lynx-bms']['127508']).to.deep.equal([0])
    expect(out['N2K.virtual-battery']['127508']).to.deep.equal([2])
  })

  it('reads switch bank instances from electrical.switches.bank.<n>', function () {
    const tree = {
      electrical: {
        switches: {
          bank: {
            '20': {
              '1': {
                state: { value: 1, $source: 'N2K.ydcc-04-a' }
              }
            },
            '21': {
              '1': {
                state: { value: 0, $source: 'N2K.ydcc-04-b' }
              }
            },
            '100': {
              '1': {
                order: { value: 1, $source: 'N2K.ydri-04' }
              }
            }
          }
        }
      }
    }
    const out = buildPgnDataInstancesFromTree(tree)
    expect(out['N2K.ydcc-04-a']['127501']).to.deep.equal([20])
    expect(out['N2K.ydcc-04-b']['127501']).to.deep.equal([21])
    expect(out['N2K.ydri-04']['127501']).to.deep.equal([100])
  })

  it('handles multi-source leaves (values block)', function () {
    const tree = {
      electrical: {
        batteries: {
          '0': {
            voltage: {
              value: 24.1,
              $source: 'N2K.preferred',
              values: {
                'N2K.preferred': { value: 24.1 },
                'N2K.backup': { value: 24.0 }
              }
            }
          }
        }
      }
    }
    const out = buildPgnDataInstancesFromTree(tree)
    expect(out['N2K.preferred']['127508']).to.deep.equal([0])
    expect(out['N2K.backup']['127508']).to.deep.equal([0])
  })

  it('returns an empty object for an empty tree', function () {
    expect(buildPgnDataInstancesFromTree({})).to.deep.equal({})
    expect(buildPgnDataInstancesFromTree(undefined)).to.deep.equal({})
  })

  it('skips non-numeric instance keys', function () {
    const tree = {
      electrical: {
        batteries: {
          notes: { value: 'meta', $source: 'N2K.x' }, // not a real path
          '0': {
            voltage: { value: 24, $source: 'N2K.x' }
          }
        }
      }
    }
    const out = buildPgnDataInstancesFromTree(tree)
    expect(out['N2K.x']['127508']).to.deep.equal([0])
  })
})

describe('buildPgnSourceKeysFromTree', function () {
  it('keys temperature publishers by their full SK leaf path', function () {
    // Reflects the real n2k-signalk mapping for PGN 130312: each
    // source-type enum routes to a fixed flat path. Two devices on
    // the same instance but different source-type publish different
    // paths and must not be flagged as conflicts.
    const tree = {
      environment: {
        inside: {
          temperature: { value: 295, $source: 'N2K.inside-sensor' },
          mainCabin: {
            temperature: { value: 296, $source: 'N2K.cabin-sensor' }
          }
        },
        outside: {
          temperature: { value: 285, $source: 'N2K.outdoor-sensor' }
        }
      }
    }
    const out = buildPgnSourceKeysFromTree(tree)
    expect(out['N2K.inside-sensor']['130312']).to.deep.equal([
      'environment.inside.temperature'
    ])
    expect(out['N2K.cabin-sensor']['130312']).to.deep.equal([
      'environment.inside.mainCabin.temperature'
    ])
    expect(out['N2K.outdoor-sensor']['130312']).to.deep.equal([
      'environment.outside.temperature'
    ])
  })

  it('handles multi-source leaves (values block)', function () {
    const tree = {
      environment: {
        outside: {
          temperature: {
            value: 285,
            $source: 'N2K.preferred',
            values: {
              'N2K.preferred': { value: 285 },
              'N2K.backup': { value: 285.5 }
            }
          }
        }
      }
    }
    const out = buildPgnSourceKeysFromTree(tree)
    expect(out['N2K.preferred']['130312']).to.deep.equal([
      'environment.outside.temperature'
    ])
    expect(out['N2K.backup']['130312']).to.deep.equal([
      'environment.outside.temperature'
    ])
  })

  it('returns empty object for tree without temp/humidity paths', function () {
    expect(
      buildPgnSourceKeysFromTree({ electrical: { batteries: {} } })
    ).to.deep.equal({})
  })
})

// A mapped device's leaves sit at its rule targets. The builders credit
// them to the rule's instance, and key them as the default-path leaf would
// be keyed, so mapped and unmapped devices compare on raw instances.
describe('tree builders with instance mappings', function () {
  const mapped = (
    entries: Array<[string, N2kInstanceRule[]]>,
    src = 5
  ): MappedSources =>
    new Map(entries.map(([ref, rules]) => [ref, { rules, src }]))

  it('reports a mapped engine under its raw instance', function () {
    const tree = {
      propulsion: {
        main: { revolutions: { value: 20, $source: 'N2K.a' } }
      }
    }
    const out = buildPgnDataInstancesFromTree(
      tree,
      mapped([
        ['N2K.a', [{ group: 'engine', instance: 0, target: 'propulsion.main' }]]
      ])
    )
    expect(out['N2K.a']['127488']).to.deep.equal([0])
    expect(out['N2K.a']['127489']).to.deep.equal([0])
  })

  it('credits a leaf at a target to the rule, not to the path segment', function () {
    // Device A swaps its batteries: 0 now writes electrical.batteries.1,
    // where unmapped device B writes its own battery 1.
    const tree = {
      electrical: {
        batteries: {
          '1': {
            voltage: {
              value: 12.5,
              $source: 'N2K.a',
              values: { 'N2K.a': { value: 12.5 }, 'N2K.b': { value: 12.4 } }
            }
          },
          house: { voltage: { value: 12.6, $source: 'N2K.a' } }
        }
      }
    }
    const out = buildPgnDataInstancesFromTree(
      tree,
      mapped([
        [
          'N2K.a',
          [
            { group: 'battery', instance: 0, target: 'electrical.batteries.1' },
            {
              group: 'battery',
              instance: 1,
              target: 'electrical.batteries.house'
            }
          ]
        ]
      ])
    )
    expect(out['N2K.a']['127508']).to.deep.equal([0, 1])
    expect(out['N2K.b']['127508']).to.deep.equal([1])
  })

  it('reports the same battery instance for a mapped and an unmapped device', function () {
    const tree = {
      electrical: {
        batteries: {
          '3': { voltage: { value: 12.4, $source: 'N2K.b' } },
          house: { voltage: { value: 12.6, $source: 'N2K.a' } }
        }
      }
    }
    const out = buildPgnDataInstancesFromTree(
      tree,
      mapped([
        [
          'N2K.a',
          [
            {
              group: 'battery',
              instance: 3,
              target: 'electrical.batteries.house'
            }
          ]
        ]
      ])
    )
    expect(out['N2K.a']['127508']).to.deep.equal([3])
    expect(out['N2K.b']['127508']).to.deep.equal([3])
  })

  it('keys a mapped tank as its default-path leaf, matching another device', function () {
    const tree = {
      tanks: {
        fuel: {
          '1': { currentLevel: { value: 0.5, $source: 'N2K.b' } },
          day: { currentLevel: { value: 0.7, $source: 'N2K.a' } }
        }
      }
    }
    const rules = mapped([
      [
        'N2K.a',
        [
          {
            group: 'tank',
            discriminator: 0,
            instance: 1,
            target: 'tanks.fuel.day'
          }
        ]
      ]
    ])
    const keys = buildPgnSourceKeysFromTree(tree, rules)
    expect(keys['N2K.a']['127505']).to.deep.equal(['tanks.fuel.1.currentLevel'])
    expect(keys['N2K.b']['127505']).to.deep.equal(['tanks.fuel.1.currentLevel'])
    const instances = buildPgnDataInstancesFromTree(tree, rules)
    expect(instances['N2K.a']['127505']).to.deep.equal([1])
    expect(instances['N2K.b']['127505']).to.deep.equal([1])
  })

  it('resolves a mapped single-leaf temperature to its instance and source', function () {
    const tree = {
      environment: {
        inside: {
          engineRoomAft: { temperature: { value: 310, $source: 'N2K.a' } }
        }
      }
    }
    const rules = mapped([
      [
        'N2K.a',
        [
          {
            group: 'temperature',
            discriminator: 3,
            instance: 1,
            target: 'environment.inside.engineRoomAft.temperature'
          }
        ]
      ]
    ])
    const keys = buildPgnSourceKeysFromTree(tree, rules)
    expect(keys['N2K.a']['130312']).to.deep.equal([
      'environment.inside.engineRoom.temperature'
    ])
    expect(keys['N2K.a']['130316']).to.deep.equal([
      'environment.inside.engineRoom.temperature'
    ])
    const instances = buildPgnDataInstancesFromTree(tree, rules)
    expect(instances['N2K.a']['130312']).to.deep.equal([1])
  })

  it('leaves devices without rules exactly as without mappings', function () {
    const tree = {
      propulsion: {
        main: { revolutions: { value: 20, $source: 'N2K.a' } }
      },
      electrical: {
        batteries: { '2': { voltage: { value: 12, $source: 'N2K.b' } } }
      },
      environment: {
        outside: { temperature: { value: 285, $source: 'N2K.b' } }
      }
    }
    const rules = mapped([
      ['N2K.a', [{ group: 'engine', instance: 0, target: 'propulsion.main' }]]
    ])
    expect(buildPgnDataInstancesFromTree(tree, rules)['N2K.b']).to.deep.equal(
      buildPgnDataInstancesFromTree(tree)['N2K.b']
    )
    expect(buildPgnSourceKeysFromTree(tree, rules)['N2K.b']).to.deep.equal(
      buildPgnSourceKeysFromTree(tree)['N2K.b']
    )
  })

  it('ignores a rule whose target holds no data from that source', function () {
    const tree = {
      propulsion: {
        main: { revolutions: { value: 20, $source: 'N2K.other' } }
      }
    }
    const out = buildPgnDataInstancesFromTree(
      tree,
      mapped([
        ['N2K.a', [{ group: 'engine', instance: 0, target: 'propulsion.main' }]]
      ])
    )
    expect(out).to.not.have.property('N2K.a')
  })
})

describe('discoveredInstance', function () {
  it('describes an engine frame with its group and editor', function () {
    expect(
      discoveredInstance({
        pgn: 127488,
        src: 5,
        fields: { instance: 'Single Engine or Dual Engine Port', speed: 1000 }
      })
    ).to.deep.equal({
      pgn: 127488,
      instance: 0,
      sourceLabel: '',
      group: 'engine',
      editor: {
        kind: 'branch',
        branches: ['propulsion', 'generator'],
        unmapped: ['propulsion.port']
      }
    })
  })

  it('keeps the source fields of a temperature frame and adds its group', function () {
    expect(
      discoveredInstance({
        pgn: 130312,
        src: 5,
        fields: {
          instance: 1,
          source: 'Engine Room Temperature',
          actualTemperature: 300
        }
      })
    ).to.deep.include({
      pgn: 130312,
      instance: 1,
      sourceLabel: 'Engine Room Temperature',
      sourceEnum: 3,
      group: 'temperature',
      discriminator: 3
    })
  })

  it('offers spec locations for a temperature frame', function () {
    const entry = discoveredInstance({
      pgn: 130312,
      src: 5,
      fields: { instance: 1, source: 'Engine Room Temperature' }
    })
    expect(entry?.editor?.kind).to.equal('location')
    expect(entry?.editor)
      .to.have.property('locations')
      .that.includes('environment.inside.<zone>.temperature')
    expect(entry?.editor?.unmapped).to.deep.equal([
      'environment.inside.engineRoom.temperature'
    ])
  })

  it('offers the spec tank types for a tank frame', function () {
    expect(
      discoveredInstance({
        pgn: 127505,
        src: 5,
        fields: { instance: 0, type: 'Fuel', level: 50 }
      })?.editor
    ).to.deep.equal({
      kind: 'branch',
      branches: [
        'tanks.freshWater',
        'tanks.wasteWater',
        'tanks.blackWater',
        'tanks.fuel',
        'tanks.lubrication',
        'tanks.liveWell',
        'tanks.baitWell',
        'tanks.gas',
        'tanks.ballast'
      ],
      unmapped: ['tanks.fuel.0']
    })
  })

  it("gives a connection's unmapped path at the device's bus address", function () {
    expect(
      discoveredInstance({
        pgn: 127751,
        src: 34,
        fields: { connectionNumber: 0, dcVoltage: 13 }
      })?.editor
    ).to.deep.equal({
      kind: 'branch',
      branches: [
        'electrical.solar',
        'electrical.alternators',
        'electrical.batteries'
      ],
      other: true,
      unmapped: ['electrical.dc.34.0']
    })
  })

  it('carries the tank type as the discriminator', function () {
    const entry = discoveredInstance({
      pgn: 127505,
      src: 5,
      fields: { instance: 1, type: 'Fuel', level: 50 }
    })
    expect(entry).to.deep.include({
      group: 'tank',
      discriminator: 0,
      instance: 1
    })
    expect(entry?.editor?.unmapped).to.deep.equal(['tanks.fuel.1'])
  })

  it('returns nothing for a PGN without data instances', function () {
    expect(
      discoveredInstance({ pgn: 129025, src: 5, fields: { latitude: 60 } })
    ).to.equal(undefined)
  })
})
