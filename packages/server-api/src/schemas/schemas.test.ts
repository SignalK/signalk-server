/**
 * Unit tests for Zod validation schemas.
 *
 * These tests verify schema behavior without needing a running server.
 */

import { describe, it } from 'mocha'
import { strict as assert } from 'assert'
import {
  AccessRequestSchema,
  DeviceAccessRequestSchema,
  UserSchema,
  SecurityConfigSchema
} from './security'
import { ServerSettingsSchema } from './settings'
import { VesselSchema } from './vessel'
import { validate, formatValidationError } from './validation'

describe('Zod Schemas', () => {
  describe('AccessRequestSchema', () => {
    it('accepts valid device access request', () => {
      const result = AccessRequestSchema.safeParse({
        clientId: 'test-device-123',
        description: 'My test device'
      })
      assert.equal(result.success, true)
    })

    it('accepts valid user access request', () => {
      const result = AccessRequestSchema.safeParse({
        userId: 'testuser',
        password: 'testpass'
      })
      assert.equal(result.success, true)
    })

    it('accepts device request with permissions', () => {
      const result = AccessRequestSchema.safeParse({
        clientId: 'test-device',
        description: 'Test',
        permissions: 'readwrite'
      })
      assert.equal(result.success, true)
    })

    it('rejects empty object', () => {
      const result = AccessRequestSchema.safeParse({})
      assert.equal(result.success, false)
    })

    it('rejects clientId without description', () => {
      const result = AccessRequestSchema.safeParse({
        clientId: 'test-device'
      })
      assert.equal(result.success, false)
    })

    it('rejects userId without password', () => {
      const result = AccessRequestSchema.safeParse({
        userId: 'testuser'
      })
      assert.equal(result.success, false)
    })

    it('rejects invalid permissions value', () => {
      const result = DeviceAccessRequestSchema.safeParse({
        clientId: 'test',
        description: 'test',
        permissions: 'superadmin'
      })
      assert.equal(result.success, false)
    })
  })

  describe('UserSchema', () => {
    it('accepts valid admin user', () => {
      const result = UserSchema.safeParse({
        type: 'admin',
        password: 'secret123'
      })
      assert.equal(result.success, true)
    })

    it('accepts valid readonly user', () => {
      const result = UserSchema.safeParse({
        type: 'readonly',
        password: 'secret123'
      })
      assert.equal(result.success, true)
    })

    it('accepts user without password (for updates)', () => {
      const result = UserSchema.safeParse({
        type: 'admin'
      })
      assert.equal(result.success, true)
    })

    it('rejects missing type', () => {
      const result = UserSchema.safeParse({
        password: 'secret'
      })
      assert.equal(result.success, false)
    })

    it('rejects invalid type', () => {
      const result = UserSchema.safeParse({
        type: 'superuser',
        password: 'secret'
      })
      assert.equal(result.success, false)
    })
  })

  describe('ServerSettingsSchema', () => {
    it('accepts valid settings with numbers', () => {
      const result = ServerSettingsSchema.safeParse({
        port: 3000,
        sslport: 3443,
        options: {
          mdns: true,
          ssl: false
        }
      })
      assert.equal(result.success, true)
      if (result.success) {
        assert.equal(result.data.port, 3000)
      }
    })

    it('coerces string port to number', () => {
      const result = ServerSettingsSchema.safeParse({
        port: '3010'
      })
      assert.equal(result.success, true)
      if (result.success) {
        assert.equal(result.data.port, 3010)
      }
    })

    it('accepts empty object (no changes)', () => {
      const result = ServerSettingsSchema.safeParse({})
      assert.equal(result.success, true)
    })

    it('accepts interfaces map', () => {
      const result = ServerSettingsSchema.safeParse({
        interfaces: {
          ws: true,
          http: true
        }
      })
      assert.equal(result.success, true)
    })

    it('rejects port out of range (too high)', () => {
      const result = ServerSettingsSchema.safeParse({
        port: 99999
      })
      assert.equal(result.success, false)
    })

    it('rejects negative port', () => {
      const result = ServerSettingsSchema.safeParse({
        port: -1
      })
      assert.equal(result.success, false)
    })

    it('rejects port 0', () => {
      const result = ServerSettingsSchema.safeParse({
        port: 0
      })
      assert.equal(result.success, false)
    })
  })

  describe('VesselSchema', () => {
    it('accepts valid vessel data', () => {
      const result = VesselSchema.safeParse({
        name: 'My Boat',
        mmsi: '123456789',
        draft: 2.5,
        length: 12
      })
      assert.equal(result.success, true)
    })

    it('accepts string numbers (from form input)', () => {
      const result = VesselSchema.safeParse({
        name: 'My Boat',
        draft: '2.5',
        length: '12'
      })
      assert.equal(result.success, true)
    })

    it('accepts empty object', () => {
      const result = VesselSchema.safeParse({})
      assert.equal(result.success, true)
    })

    it('accepts partial vessel data', () => {
      const result = VesselSchema.safeParse({
        name: 'Just A Name'
      })
      assert.equal(result.success, true)
    })

    it('allows passthrough of extra fields', () => {
      const result = VesselSchema.safeParse({
        name: 'My Boat',
        customField: 'some value'
      })
      assert.equal(result.success, true)
      if (result.success) {
        assert.equal(
          (result.data as Record<string, unknown>).customField,
          'some value'
        )
      }
    })
  })

  describe('SecurityConfigSchema', () => {
    it('accepts valid config', () => {
      const result = SecurityConfigSchema.safeParse({
        expiration: '1h',
        allowDeviceAccessRequests: true,
        allowNewUserRegistration: false
      })
      assert.equal(result.success, true)
    })

    it('accepts empty config', () => {
      const result = SecurityConfigSchema.safeParse({})
      assert.equal(result.success, true)
    })

    it('accepts config with ACLs', () => {
      const result = SecurityConfigSchema.safeParse({
        acls: [
          {
            context: 'vessels.self',
            resources: [
              {
                paths: ['navigation.*'],
                permissions: [{ subject: 'any', permission: 'read' }]
              }
            ]
          }
        ]
      })
      assert.equal(result.success, true)
    })

    it('allows passthrough for extensibility', () => {
      const result = SecurityConfigSchema.safeParse({
        expiration: '1h',
        customSecuritySetting: 'value'
      })
      assert.equal(result.success, true)
    })
  })

  describe('validate helper', () => {
    it('returns success with data for valid input', () => {
      const result = validate(UserSchema, { type: 'admin' })
      assert.equal(result.success, true)
      if (result.success) {
        assert.equal(result.data.type, 'admin')
      }
    })

    it('returns error for invalid input', () => {
      const result = validate(UserSchema, { type: 'invalid' })
      assert.equal(result.success, false)
      if (!result.success) {
        assert.ok(result.error.issues.length > 0)
      }
    })
  })

  describe('formatValidationError', () => {
    it('formats error with path and message', () => {
      const result = UserSchema.safeParse({ type: 'invalid' })
      if (!result.success) {
        const formatted = formatValidationError(result.error)
        assert.equal(formatted.message, 'Validation failed')
        assert.ok(Array.isArray(formatted.errors))
        assert.ok(formatted.errors.length > 0)
        assert.ok('path' in formatted.errors[0]!)
        assert.ok('message' in formatted.errors[0]!)
      }
    })
  })
})
