import { expect } from 'chai'
import {
  parseOIDCConfig,
  isOIDCEnabled,
  validateOIDCConfig,
  parseEnvConfig,
  mergeConfigs
} from '../../src/oidc/config'
import { OIDCError, OIDC_DEFAULTS } from '../../src/oidc/types'

describe('OIDC Configuration', () => {
  const validConfig = {
    enabled: true,
    issuer: 'https://auth.example.com',
    clientId: 'signalk-server',
    clientSecret: 'test-secret'
  }

  describe('parseEnvConfig', () => {
    const originalEnv = process.env

    beforeEach(() => {
      process.env = { ...originalEnv }
    })

    afterEach(() => {
      process.env = originalEnv
    })

    it('should parse environment variables correctly', () => {
      process.env.SIGNALK_OIDC_ENABLED = 'true'
      process.env.SIGNALK_OIDC_ISSUER = 'https://auth.example.com'
      process.env.SIGNALK_OIDC_CLIENT_ID = 'my-client'
      process.env.SIGNALK_OIDC_CLIENT_SECRET = 'my-secret'
      process.env.SIGNALK_OIDC_SCOPE = 'openid email'
      process.env.SIGNALK_OIDC_DEFAULT_PERMISSION = 'readwrite'

      const config = parseEnvConfig()

      expect(config.enabled).to.equal(true)
      expect(config.issuer).to.equal('https://auth.example.com')
      expect(config.clientId).to.equal('my-client')
      expect(config.clientSecret).to.equal('my-secret')
      expect(config.scope).to.equal('openid email')
      expect(config.defaultPermission).to.equal('readwrite')
    })

    it('should return undefined for unset environment variables', () => {
      const config = parseEnvConfig()

      expect(config.enabled).to.equal(undefined)
      expect(config.issuer).to.equal(undefined)
      expect(config.clientId).to.equal(undefined)
    })

    it('should parse enabled as false correctly', () => {
      process.env.SIGNALK_OIDC_ENABLED = 'false'
      const config = parseEnvConfig()
      expect(config.enabled).to.equal(false)
    })

    it('should parse autoCreateUsers correctly', () => {
      process.env.SIGNALK_OIDC_AUTO_CREATE_USERS = 'false'
      const config = parseEnvConfig()
      expect(config.autoCreateUsers).to.equal(false)
    })

    it('should parse admin groups from comma-separated string', () => {
      process.env.SIGNALK_OIDC_ADMIN_GROUPS = 'admins,sk-admin,superusers'
      const config = parseEnvConfig()
      expect(config.adminGroups).to.deep.equal(['admins', 'sk-admin', 'superusers'])
    })

    it('should parse readwrite groups from comma-separated string', () => {
      process.env.SIGNALK_OIDC_READWRITE_GROUPS = 'users,operators'
      const config = parseEnvConfig()
      expect(config.readwriteGroups).to.deep.equal(['users', 'operators'])
    })

    it('should handle single admin group', () => {
      process.env.SIGNALK_OIDC_ADMIN_GROUPS = 'admins'
      const config = parseEnvConfig()
      expect(config.adminGroups).to.deep.equal(['admins'])
    })

    it('should handle empty admin groups string', () => {
      process.env.SIGNALK_OIDC_ADMIN_GROUPS = ''
      const config = parseEnvConfig()
      expect(config.adminGroups).to.equal(undefined)
    })

    it('should trim whitespace from group names', () => {
      process.env.SIGNALK_OIDC_ADMIN_GROUPS = ' admins , sk-admin '
      const config = parseEnvConfig()
      expect(config.adminGroups).to.deep.equal(['admins', 'sk-admin'])
    })

    it('should parse groups attribute', () => {
      process.env.SIGNALK_OIDC_GROUPS_ATTRIBUTE = 'roles'
      const config = parseEnvConfig()
      expect(config.groupsAttribute).to.equal('roles')
    })
  })

  describe('mergeConfigs', () => {
    it('should merge security.json oidc section with defaults', () => {
      const securityJsonConfig = {
        enabled: true,
        issuer: 'https://auth.example.com',
        clientId: 'signalk',
        clientSecret: 'secret'
      }

      const result = mergeConfigs(securityJsonConfig, {})

      expect(result.enabled).to.equal(true)
      expect(result.issuer).to.equal('https://auth.example.com')
      expect(result.scope).to.equal(OIDC_DEFAULTS.scope)
      expect(result.defaultPermission).to.equal(OIDC_DEFAULTS.defaultPermission)
    })

    it('should merge env vars over security.json', () => {
      const securityJsonConfig = {
        enabled: true,
        issuer: 'https://auth.example.com',
        clientId: 'signalk',
        clientSecret: 'old-secret',
        scope: 'openid'
      }

      const envConfig = {
        clientSecret: 'new-secret',
        scope: 'openid email profile groups'
      }

      const result = mergeConfigs(securityJsonConfig, envConfig)

      expect(result.clientSecret).to.equal('new-secret')
      expect(result.scope).to.equal('openid email profile groups')
      expect(result.issuer).to.equal('https://auth.example.com')
    })

    it('should apply defaults for missing optional fields', () => {
      const securityJsonConfig = {
        enabled: true,
        issuer: 'https://auth.example.com',
        clientId: 'signalk',
        clientSecret: 'secret'
      }

      const result = mergeConfigs(securityJsonConfig, {})

      expect(result.scope).to.equal('openid email profile')
      expect(result.defaultPermission).to.equal('readonly')
      expect(result.autoCreateUsers).to.equal(true)
    })

    it('should merge admin groups from security.json', () => {
      const securityJsonConfig = {
        enabled: true,
        issuer: 'https://auth.example.com',
        clientId: 'signalk',
        clientSecret: 'secret',
        adminGroups: ['admins', 'sk-admin']
      }

      const result = mergeConfigs(securityJsonConfig, {})

      expect(result.adminGroups).to.deep.equal(['admins', 'sk-admin'])
    })

    it('should merge readwrite groups from security.json', () => {
      const securityJsonConfig = {
        enabled: true,
        issuer: 'https://auth.example.com',
        clientId: 'signalk',
        clientSecret: 'secret',
        readwriteGroups: ['users', 'operators']
      }

      const result = mergeConfigs(securityJsonConfig, {})

      expect(result.readwriteGroups).to.deep.equal(['users', 'operators'])
    })

    it('should override admin groups from env over security.json', () => {
      const securityJsonConfig = {
        enabled: true,
        issuer: 'https://auth.example.com',
        clientId: 'signalk',
        clientSecret: 'secret',
        adminGroups: ['json-admins']
      }

      const envConfig = {
        adminGroups: ['env-admins', 'env-superusers']
      }

      const result = mergeConfigs(securityJsonConfig, envConfig)

      expect(result.adminGroups).to.deep.equal(['env-admins', 'env-superusers'])
    })

    it('should merge groups attribute', () => {
      const securityJsonConfig = {
        enabled: true,
        issuer: 'https://auth.example.com',
        clientId: 'signalk',
        clientSecret: 'secret',
        groupsAttribute: 'roles'
      }

      const result = mergeConfigs(securityJsonConfig, {})

      expect(result.groupsAttribute).to.equal('roles')
    })
  })

  describe('validateOIDCConfig', () => {
    it('should pass for valid complete config', () => {
      expect(() => validateOIDCConfig(validConfig)).to.not.throw()
    })

    it('should throw for missing required fields when enabled', () => {
      const incomplete = { enabled: true, issuer: 'https://auth.example.com' }
      expect(() => validateOIDCConfig(incomplete)).to.throw(OIDCError)
    })

    it('should throw if issuer is not a valid URL', () => {
      const badIssuer = { ...validConfig, issuer: 'not-a-url' }
      expect(() => validateOIDCConfig(badIssuer)).to.throw(
        OIDCError,
        /valid URL/
      )
    })

    it('should throw if scope does not contain openid', () => {
      const badScope = { ...validConfig, scope: 'email profile' }
      expect(() => validateOIDCConfig(badScope)).to.throw(OIDCError, /openid/)
    })

    it('should throw if defaultPermission is invalid', () => {
      const badPermission = {
        ...validConfig,
        defaultPermission: 'superadmin' as 'readonly' | 'readwrite' | 'admin'
      }
      expect(() => validateOIDCConfig(badPermission)).to.throw(
        OIDCError,
        /defaultPermission/
      )
    })

    it('should not throw when disabled even if incomplete', () => {
      const disabled = { enabled: false }
      expect(() => validateOIDCConfig(disabled)).to.not.throw()
    })
  })

  describe('parseOIDCConfig', () => {
    const originalEnv = process.env

    beforeEach(() => {
      process.env = { ...originalEnv }
    })

    afterEach(() => {
      process.env = originalEnv
    })

    it('should parse complete config from security.json', () => {
      const securityConfig = { oidc: validConfig }
      const result = parseOIDCConfig(securityConfig)

      expect(result.enabled).to.equal(true)
      expect(result.issuer).to.equal('https://auth.example.com')
      expect(result.clientId).to.equal('signalk-server')
      expect(result.clientSecret).to.equal('test-secret')
    })

    it('should override with environment variables', () => {
      process.env.SIGNALK_OIDC_CLIENT_SECRET = 'env-secret'
      const securityConfig = { oidc: validConfig }
      const result = parseOIDCConfig(securityConfig)

      expect(result.clientSecret).to.equal('env-secret')
    })

    it('should return disabled config when oidc section missing', () => {
      const result = parseOIDCConfig({})
      expect(result.enabled).to.equal(false)
    })

    it('should validate the final config', () => {
      const badConfig = { oidc: { enabled: true, issuer: 'bad-url' } }
      expect(() => parseOIDCConfig(badConfig)).to.throw(OIDCError)
    })
  })

  describe('isOIDCEnabled', () => {
    it('should return false when not configured', () => {
      const config = parseOIDCConfig({})
      expect(isOIDCEnabled(config)).to.equal(false)
    })

    it('should return false when explicitly disabled', () => {
      const config = parseOIDCConfig({
        oidc: { ...validConfig, enabled: false }
      })
      expect(isOIDCEnabled(config)).to.equal(false)
    })

    it('should return true when properly configured and enabled', () => {
      const config = parseOIDCConfig({ oidc: validConfig })
      expect(isOIDCEnabled(config)).to.equal(true)
    })
  })
})
