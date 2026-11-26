import { expect } from 'chai'
import { seatalkArgs } from './seatalk-args'

describe('seatalkArgs', () => {
  it('passes through valid GPIO pin and invert flag', () => {
    expect(seatalkArgs('GPIO04', true)).to.equal('GPIO04 true')
    expect(seatalkArgs('GPIO27', 'true')).to.equal('GPIO27 true')
    expect(seatalkArgs('GPIO4', false)).to.equal('GPIO4 false')
  })

  it('falls back to defaults for missing values', () => {
    expect(seatalkArgs(undefined, undefined)).to.equal('undefined false')
  })

  it('rejects shell metacharacters in gpio', () => {
    for (const payload of [
      'GPIO04; touch /tmp/pwned',
      '$(id)',
      '`id`',
      'GPIO04 && id',
      "GPIO04'",
      'GPIO04\nid'
    ]) {
      expect(seatalkArgs(payload, false)).to.equal('undefined false')
    }
  })

  it('rejects shell metacharacters in gpioInvert', () => {
    expect(seatalkArgs('GPIO04', 'true; id')).to.equal('GPIO04 false')
    expect(seatalkArgs('GPIO04', '$(id)')).to.equal('GPIO04 false')
  })
})
