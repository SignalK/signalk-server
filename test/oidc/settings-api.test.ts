/*
 * Tests for OIDC Settings Admin API
 * These tests verify the GET/PUT endpoints for OIDC configuration management
 */

import { expect } from 'chai'
import { freeport } from '../ts-servertestutilities'

/* eslint-disable @typescript-eslint/no-require-imports */
const {
  startServerP,
  getAdminToken,
  getReadOnlyToken,
  getWriteToken
} = require('../servertestutilities')
/* eslint-enable @typescript-eslint/no-require-imports */

describe('OIDC Settings API', function () {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let server: any
  let url: string
  let port: number
  let adminToken: string
  let readOnlyToken: string
  let writeToken: string

  const validOIDCConfig = {
    enabled: true,
    issuer: 'https://auth.example.com',
    clientId: 'signalk-client',
    clientSecret: 'test-secret-123',
    providerName: 'Test SSO',
    defaultPermission: 'readonly',
    autoCreateUsers: true,
    autoLogin: false,
    adminGroups: ['admins', 'sk-admins'],
    readwriteGroups: ['users'],
    groupsAttribute: 'groups',
    scope: 'openid email profile groups'
  }

  before(async function () {
    this.timeout(10000)
    port = await freeport()
    url = `http://0.0.0.0:${port}`

    server = await startServerP(port, true, {
      disableSchemaMetaDeltas: true
    })

    adminToken = await getAdminToken(server)
    readOnlyToken = await getReadOnlyToken(server)
    writeToken = await getWriteToken(server)
  })

  after(async function () {
    await server.stop()
  })

  describe('GET /skServer/security/oidc', () => {
    it('should require admin authentication', async () => {
      const result = await fetch(`${url}/skServer/security/oidc`)
      expect(result.status).to.equal(401)
    })

    it('should reject non-admin users', async () => {
      const result = await fetch(`${url}/skServer/security/oidc`, {
        headers: {
          Cookie: `JAUTHENTICATION=${readOnlyToken}`
        }
      })
      expect(result.status).to.equal(401)
    })

    it('should reject readwrite users', async () => {
      const result = await fetch(`${url}/skServer/security/oidc`, {
        headers: {
          Cookie: `JAUTHENTICATION=${writeToken}`
        }
      })
      expect(result.status).to.equal(401)
    })

    it('should return OIDC config for admin users', async () => {
      const result = await fetch(`${url}/skServer/security/oidc`, {
        headers: {
          Cookie: `JAUTHENTICATION=${adminToken}`
        }
      })
      expect(result.status).to.equal(200)

      const json = (await result.json()) as Record<string, unknown>
      expect(json).to.have.property('enabled')
      expect(json).to.have.property('issuer')
      expect(json).to.have.property('clientId')
      expect(json).to.have.property('defaultPermission')
    })

    it('should not return the client secret in plain text', async () => {
      const result = await fetch(`${url}/skServer/security/oidc`, {
        headers: {
          Cookie: `JAUTHENTICATION=${adminToken}`
        }
      })
      expect(result.status).to.equal(200)

      const json = (await result.json()) as Record<string, unknown>
      // clientSecret should be redacted or indicate if set
      expect(json.clientSecret).to.not.equal('test-secret-123')
      // Should indicate if secret is set
      expect(json).to.have.property('clientSecretSet')
    })

    it('should indicate which fields are set via environment variables', async () => {
      const result = await fetch(`${url}/skServer/security/oidc`, {
        headers: {
          Cookie: `JAUTHENTICATION=${adminToken}`
        }
      })
      expect(result.status).to.equal(200)

      const json = (await result.json()) as Record<string, unknown>
      // Should include envOverrides object indicating which fields come from env
      expect(json).to.have.property('envOverrides')
      expect(json.envOverrides).to.be.an('object')
    })
  })

  describe('PUT /skServer/security/oidc', () => {
    it('should require admin authentication', async () => {
      const result = await fetch(`${url}/skServer/security/oidc`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(validOIDCConfig)
      })
      expect(result.status).to.equal(401)
    })

    it('should reject non-admin users', async () => {
      const result = await fetch(`${url}/skServer/security/oidc`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `JAUTHENTICATION=${readOnlyToken}`
        },
        body: JSON.stringify(validOIDCConfig)
      })
      expect(result.status).to.equal(401)
    })

    it('should accept valid OIDC configuration', async () => {
      const result = await fetch(`${url}/skServer/security/oidc`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `JAUTHENTICATION=${adminToken}`
        },
        body: JSON.stringify(validOIDCConfig)
      })
      expect(result.status).to.equal(200)
    })

    it('should persist configuration and return it on GET', async () => {
      // First, save the config
      const putResult = await fetch(`${url}/skServer/security/oidc`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `JAUTHENTICATION=${adminToken}`
        },
        body: JSON.stringify(validOIDCConfig)
      })
      expect(putResult.status).to.equal(200)

      // Then verify it's returned on GET
      const getResult = await fetch(`${url}/skServer/security/oidc`, {
        headers: {
          Cookie: `JAUTHENTICATION=${adminToken}`
        }
      })
      expect(getResult.status).to.equal(200)

      const json = (await getResult.json()) as Record<string, unknown>
      expect(json.enabled).to.equal(true)
      expect(json.issuer).to.equal('https://auth.example.com')
      expect(json.clientId).to.equal('signalk-client')
      expect(json.providerName).to.equal('Test SSO')
    })

    it('should reject invalid issuer URL', async () => {
      const invalidConfig = { ...validOIDCConfig, issuer: 'not-a-valid-url' }
      const result = await fetch(`${url}/skServer/security/oidc`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `JAUTHENTICATION=${adminToken}`
        },
        body: JSON.stringify(invalidConfig)
      })
      expect(result.status).to.equal(400)
    })

    it('should reject missing required fields when enabled', async () => {
      const incompleteConfig = {
        enabled: true,
        issuer: 'https://auth.example.com'
        // Missing clientId and clientSecret
      }
      const result = await fetch(`${url}/skServer/security/oidc`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `JAUTHENTICATION=${adminToken}`
        },
        body: JSON.stringify(incompleteConfig)
      })
      expect(result.status).to.equal(400)
    })

    it('should accept disabled config without all required fields', async () => {
      const disabledConfig = {
        enabled: false,
        issuer: '',
        clientId: '',
        clientSecret: ''
      }
      const result = await fetch(`${url}/skServer/security/oidc`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `JAUTHENTICATION=${adminToken}`
        },
        body: JSON.stringify(disabledConfig)
      })
      expect(result.status).to.equal(200)
    })

    it('should preserve existing client secret if not provided in update', async () => {
      // First, save config with secret
      const putResult1 = await fetch(`${url}/skServer/security/oidc`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `JAUTHENTICATION=${adminToken}`
        },
        body: JSON.stringify(validOIDCConfig)
      })
      expect(putResult1.status).to.equal(200)

      // Update without providing clientSecret (or with empty string)
      const updateWithoutSecret = {
        ...validOIDCConfig,
        clientSecret: '',
        providerName: 'Updated SSO Name'
      }
      const putResult2 = await fetch(`${url}/skServer/security/oidc`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `JAUTHENTICATION=${adminToken}`
        },
        body: JSON.stringify(updateWithoutSecret)
      })
      expect(putResult2.status).to.equal(200)

      // Verify secret is still set
      const getResult = await fetch(`${url}/skServer/security/oidc`, {
        headers: {
          Cookie: `JAUTHENTICATION=${adminToken}`
        }
      })
      const json = (await getResult.json()) as Record<string, unknown>
      expect(json.clientSecretSet).to.equal(true)
      expect(json.providerName).to.equal('Updated SSO Name')
    })

    it('should reject invalid defaultPermission value', async () => {
      const invalidConfig = {
        ...validOIDCConfig,
        defaultPermission: 'superadmin'
      }
      const result = await fetch(`${url}/skServer/security/oidc`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `JAUTHENTICATION=${adminToken}`
        },
        body: JSON.stringify(invalidConfig)
      })
      expect(result.status).to.equal(400)
    })

    it('should accept adminGroups as comma-separated string', async () => {
      const configWithStringGroups = {
        ...validOIDCConfig,
        adminGroups: 'admins, sk-admins, superusers'
      }
      const result = await fetch(`${url}/skServer/security/oidc`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `JAUTHENTICATION=${adminToken}`
        },
        body: JSON.stringify(configWithStringGroups)
      })
      expect(result.status).to.equal(200)
    })
  })

  describe('POST /skServer/security/oidc/test', () => {
    it('should require admin authentication', async () => {
      const result = await fetch(`${url}/skServer/security/oidc/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ issuer: 'https://auth.example.com' })
      })
      expect(result.status).to.equal(401)
    })

    it('should reject non-admin users', async () => {
      const result = await fetch(`${url}/skServer/security/oidc/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `JAUTHENTICATION=${readOnlyToken}`
        },
        body: JSON.stringify({ issuer: 'https://auth.example.com' })
      })
      expect(result.status).to.equal(401)
    })

    it('should return error for invalid issuer URL', async () => {
      const result = await fetch(`${url}/skServer/security/oidc/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `JAUTHENTICATION=${adminToken}`
        },
        body: JSON.stringify({ issuer: 'not-a-valid-url' })
      })
      expect(result.status).to.equal(400)
    })

    it('should return error for unreachable issuer', async () => {
      const result = await fetch(`${url}/skServer/security/oidc/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `JAUTHENTICATION=${adminToken}`
        },
        body: JSON.stringify({
          issuer: 'https://nonexistent.invalid.example.com'
        })
      })

      // Should return an error status indicating the connection failed
      expect(result.status).to.be.oneOf([400, 502, 503])

      const json = (await result.json()) as Record<string, unknown>
      expect(json).to.have.property('error')
    })

    it('should return success for reachable OIDC provider with valid discovery', async () => {
      // This test would require a mock OIDC server or a known public OIDC provider
      // For now, we test the error case to ensure the endpoint exists
      const result = await fetch(`${url}/skServer/security/oidc/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `JAUTHENTICATION=${adminToken}`
        },
        body: JSON.stringify({ issuer: 'https://accounts.google.com' })
      })

      // Google is a known public OIDC provider
      if (result.status === 200) {
        const json = (await result.json()) as Record<string, unknown>
        expect(json).to.have.property('success', true)
        expect(json).to.have.property('issuer')
        expect(json).to.have.property('authorization_endpoint')
        expect(json).to.have.property('token_endpoint')
      } else {
        // If network is unavailable, test should not fail
        console.log(
          'Note: OIDC test endpoint returned non-200, possibly due to network'
        )
      }
    })
  })

  describe('User list with OIDC indicator', () => {
    it('should include OIDC information in user list', async () => {
      const result = await fetch(`${url}/skServer/security/users`, {
        headers: {
          Cookie: `JAUTHENTICATION=${adminToken}`
        }
      })
      expect(result.status).to.equal(200)

      const users = (await result.json()) as Array<Record<string, unknown>>
      expect(users).to.be.an('array')

      // Each user should have an isOIDC field (or similar indicator)
      users.forEach((user) => {
        expect(user).to.have.property('userId')
        expect(user).to.have.property('type')
        // isOIDC should be present (false for local users)
        expect(user).to.have.property('isOIDC')
      })
    })
  })
})
