import { expect } from 'chai'
import { Value } from '@sinclair/typebox/value'
import {
  checkAccessRequestSchema,
  requestAccessSchema,
  testConnectionSchema
} from '../src/remoteConnectionSchemas'

const UUID = 'b3c1d2e4-5f6a-4b8c-9d0e-1f2a3b4c5d6e'

describe('remoteConnectionSchemas', () => {
  describe('checkAccessRequestSchema requestId (path traversal)', () => {
    const base = { host: 'sk.local', port: 3000 }

    it('accepts a UUID requestId', () => {
      expect(
        Value.Check(checkAccessRequestSchema, { ...base, requestId: UUID })
      ).to.equal(true)
    })

    const badRequestIds = [
      '../../latest/meta-data/iam/security-credentials/role',
      '..%2f..%2fadmin',
      'not-a-uuid',
      `${UUID}/extra`,
      ''
    ]
    badRequestIds.forEach((requestId) => {
      it(`rejects requestId ${JSON.stringify(requestId)}`, () => {
        expect(
          Value.Check(checkAccessRequestSchema, { ...base, requestId })
        ).to.equal(false)
      })
    })

    it('rejects a missing requestId', () => {
      expect(Value.Check(checkAccessRequestSchema, base)).to.equal(false)
    })
  })

  describe('host and port validation', () => {
    const withRid = (extra: object) => ({ requestId: UUID, ...extra })

    it('accepts an integer port', () => {
      expect(
        Value.Check(
          checkAccessRequestSchema,
          withRid({ host: 'h', port: 3000 })
        )
      ).to.equal(true)
    })

    it('accepts a numeric string port (the admin UI sends strings)', () => {
      expect(
        Value.Check(
          checkAccessRequestSchema,
          withRid({ host: 'h', port: '3000' })
        )
      ).to.equal(true)
    })

    const badHostPort = [
      { host: '', port: 3000 }, // empty host
      { host: 'h' }, // missing port
      { host: 'h', port: 'abc' }, // non-numeric port
      { host: 'h', port: ['3000'] }, // array port
      { host: 'h', port: 0 }, // out of range
      { host: 'h', port: 70000 }, // out of range
      { host: 'h', port: '70000' } // out of range string
    ]
    badHostPort.forEach((partial) => {
      it(`rejects ${JSON.stringify(partial)}`, () => {
        expect(
          Value.Check(checkAccessRequestSchema, withRid(partial))
        ).to.equal(false)
      })
    })
  })

  describe('testConnectionSchema', () => {
    it('accepts optional token and booleans', () => {
      expect(
        Value.Check(testConnectionSchema, {
          host: 'h',
          port: 3000,
          useTLS: true,
          selfsignedcert: false,
          token: 'jwt'
        })
      ).to.equal(true)
    })

    it('accepts the minimal body', () => {
      expect(
        Value.Check(testConnectionSchema, { host: 'h', port: 3000 })
      ).to.equal(true)
    })

    it('rejects a non-boolean useTLS', () => {
      expect(
        Value.Check(testConnectionSchema, {
          host: 'h',
          port: 3000,
          useTLS: 'yes'
        })
      ).to.equal(false)
    })
  })

  describe('requestAccessSchema', () => {
    it('accepts clientId and description', () => {
      expect(
        Value.Check(requestAccessSchema, {
          host: 'h',
          port: 3000,
          clientId: 'c',
          description: 'd'
        })
      ).to.equal(true)
    })
  })
})
