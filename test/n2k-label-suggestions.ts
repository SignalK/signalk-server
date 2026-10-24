import { expect } from 'chai'
import {
  buildLabelSuggestions,
  isSameDevice
} from '../src/n2k-label-suggestions'

// Shaped like @signalk/n2k-signalk's PGN 126983 notification value.
function alert(
  message: string,
  location: string,
  instance: number,
  index: number
) {
  return {
    value: {
      state: 'normal',
      method: [],
      message,
      location,
      dataSourceInstance: instance,
      'dataSourceIndex-Source': index
    },
    $source: 'IPG.c0a0aad71135b49a'
  }
}

function switchState(meta?: Record<string, unknown>) {
  return { value: 0, $source: 'IPG.c0a0aad71135b49a', ...(meta && { meta }) }
}

describe('buildLabelSuggestions', function () {
  it('names a switch channel after the alert on its bank and index', function () {
    const tree = {
      electrical: {
        switches: { bank: { '215': { '1': { state: switchState() } } } }
      },
      notifications: {
        nmea: {
          alarm: {
            navigational: {
              '22': { '8196': alert('Highwater', 'ER Port', 215, 1) }
            }
          }
        }
      }
    }
    expect(buildLabelSuggestions(tree, undefined)).to.deep.equal([
      {
        path: 'electrical.switches.bank.215.1.state',
        label: 'ER Port Highwater',
        source: 'alertText',
        alertPath: 'notifications.nmea.alarm.navigational.22.8196'
      }
    ])
  })

  it('uses the alert text alone when it has no location', function () {
    const tree = {
      electrical: {
        switches: { bank: { '12': { '3': { state: switchState() } } } }
      },
      notifications: {
        nmea: {
          warning: { other: { '1': { '7': alert('Bilge', '', 12, 3) } } }
        }
      }
    }
    expect(
      buildLabelSuggestions(tree, undefined).map((s) => s.label)
    ).to.deep.equal(['Bilge'])
  })

  it('never suggests a name for a path that already has one', function () {
    const tree = {
      electrical: {
        switches: {
          bank: {
            '215': {
              '1': { state: switchState({ displayName: 'Engine room bilge' }) }
            }
          }
        }
      },
      notifications: {
        nmea: {
          alarm: {
            navigational: {
              '22': { '8196': alert('Highwater', 'ER Port', 215, 1) }
            }
          }
        }
      }
    }
    expect(buildLabelSuggestions(tree, undefined)).to.deep.equal([])
  })

  it('treats a blank displayName as no name', function () {
    const tree = {
      electrical: {
        switches: {
          bank: { '215': { '1': { state: switchState({ displayName: ' ' }) } } }
        }
      },
      notifications: {
        nmea: {
          alarm: {
            navigational: {
              '22': { '8196': alert('Highwater', 'ER Port', 215, 1) }
            }
          }
        }
      }
    }
    expect(buildLabelSuggestions(tree, undefined)).to.have.length(1)
  })

  it('ignores an alert whose data source is not a switch channel', function () {
    // An alert on tank or temperature instance 3 carries the same
    // fields; with no electrical.switches.bank.3.1 it names nothing.
    const tree = {
      electrical: {
        switches: { bank: { '215': { '1': { state: switchState() } } } }
      },
      notifications: {
        nmea: {
          warning: {
            other: { '1': { '9': alert('Fuel low', 'Port tank', 3, 1) } }
          }
        }
      }
    }
    expect(buildLabelSuggestions(tree, undefined)).to.deep.equal([])
  })

  it('offers each distinct alert on a channel, in a stable order', function () {
    const tree = {
      electrical: {
        switches: {
          bank: {
            '210': {
              '5': { state: switchState() },
              '6': { state: switchState() }
            }
          }
        }
      },
      notifications: {
        nmea: {
          alarm: {
            navigational: {
              '22': {
                '20502': alert('Fire 8Ohm', 'Galley', 210, 6),
                '20501': alert('CO 8Ohm', 'Galley', 210, 5),
                '20601': alert('CO 8Ohm', 'Galley', 210, 5),
                '20701': alert('Gas', 'Galley', 210, 5)
              }
            }
          }
        }
      }
    }
    expect(
      buildLabelSuggestions(tree, undefined).map((s) => [s.path, s.label])
    ).to.deep.equal([
      ['electrical.switches.bank.210.5.state', 'Galley CO 8Ohm'],
      ['electrical.switches.bank.210.5.state', 'Galley Gas'],
      ['electrical.switches.bank.210.6.state', 'Galley Fire 8Ohm']
    ])
  })

  it('returns nothing for a tree without N2K alerts', function () {
    expect(buildLabelSuggestions(undefined, undefined)).to.deep.equal([])
    expect(
      buildLabelSuggestions({ notifications: {} }, undefined)
    ).to.deep.equal([])
  })

  describe('with the switch device known', function () {
    // SIM100 at address 237 claims c0a0aad71135b49a; the IPG100 sends
    // its NAME in alerts with the 32-bit halves swapped.
    const SIM100 = 'c0a0aad71135b49a'
    const SIM100_IN_ALERT = Number(0x1135b49ac0a0aad7n)

    function treeWithAlertFrom(alertName: number) {
      const a = alert('Highwater', 'ER Port', 215, 1)
      return {
        electrical: {
          switches: {
            bank: {
              '215': { '1': { state: { value: 0, $source: 'IPG.237' } } }
            }
          }
        },
        notifications: {
          nmea: {
            alarm: {
              navigational: {
                '22': {
                  '8196': {
                    ...a,
                    value: { ...a.value, dataSourceNetworkIDNAME: alertName }
                  }
                }
              }
            }
          }
        }
      }
    }
    const sources = { IPG: { '237': { n2k: { canName: SIM100 } } } }

    it('suggests when the alert comes from the switch device', function () {
      expect(
        buildLabelSuggestions(treeWithAlertFrom(SIM100_IN_ALERT), sources)
      ).to.have.length(1)
    })

    it('does not suggest when the alert comes from another device', function () {
      const tankSensor = Number(0x2235b49ac0a0aad7n)
      expect(
        buildLabelSuggestions(treeWithAlertFrom(tankSensor), sources)
      ).to.deep.equal([])
    })

    it('reads a canName sourceRef without the sources tree', function () {
      const tree = treeWithAlertFrom(SIM100_IN_ALERT)
      tree.electrical.switches.bank['215']['1'].state.$source = `IPG.${SIM100}`
      expect(buildLabelSuggestions(tree, undefined)).to.have.length(1)
    })
  })

  describe('isSameDevice', function () {
    const SIM100 = 0xc0a0aad71135b49an

    it('matches a NAME in claim order', function () {
      expect(isSameDevice(Number(SIM100), SIM100)).to.equal(true)
    })

    it('matches a NAME with its 32-bit halves swapped', function () {
      expect(isSameDevice(Number(0x1135b49ac0a0aad7n), SIM100)).to.equal(true)
    })

    it('ignores the system instance', function () {
      // The device now claims system instance 10; the alert still
      // carries the 0 it was configured with.
      expect(
        isSameDevice(Number(0x1135b49ac0a0aad7n), 0xcaa0aad71135b49an)
      ).to.equal(true)
    })

    it('tells devices with another unique number apart', function () {
      expect(isSameDevice(Number(0x1135b48fc0a0aad7n), SIM100)).to.equal(false)
    })
  })
})
