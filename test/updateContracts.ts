import { expect } from 'chai'
import {
  resolveUpdateContract,
  resolveUpdateContractFromDefaults
} from '../src/updateContracts'

describe('updateContracts', () => {
  describe('resolveUpdateContractFromDefaults', () => {
    it('classifies a shipped prefix as event', () => {
      expect(resolveUpdateContractFromDefaults('notifications')).to.equal(
        'event'
      )
    })

    it('classifies a descendant of a shipped prefix', () => {
      expect(
        resolveUpdateContractFromDefaults('navigation.anchor.position')
      ).to.equal('event')
    })

    it('leaves an uncovered path unclassified', () => {
      expect(resolveUpdateContractFromDefaults('navigation.state')).to.equal(
        undefined
      )
    })

    it('does not match a prefix that is only a string prefix', () => {
      // `navigation.anchoring` must not inherit `navigation.anchor`.
      expect(
        resolveUpdateContractFromDefaults('navigation.anchoring')
      ).to.equal(undefined)
    })
  })

  describe('resolveUpdateContract', () => {
    it('prefers an explicit contract over the shipped classification', () => {
      expect(
        resolveUpdateContract('notifications', { updateContract: 'periodic' })
      ).to.equal('periodic')
    })

    it('falls back to the shipped classification', () => {
      expect(resolveUpdateContract('design.airHeight', undefined)).to.equal(
        'event'
      )
    })

    it('treats an unclassified path as periodic', () => {
      expect(resolveUpdateContract('navigation.state', undefined)).to.equal(
        'periodic'
      )
    })

    it('treats metadata without a contract as unset', () => {
      expect(
        resolveUpdateContract('navigation.state', { units: 'm/s' })
      ).to.equal('periodic')
    })
  })
})
