import { expect } from 'chai'

import { findOrCreateOIDCUser } from '../../src/oidc/oidc-auth'
import type {
  ExternalUser,
  ExternalUserService,
  OIDCConfig,
  OIDCUserInfo
} from '../../src/oidc/types'

describe('OIDC Find or Create User', () => {
  const baseConfig: OIDCConfig = {
    enabled: true,
    issuer: 'https://auth.example.com',
    clientId: 'signalk-server',
    clientSecret: 'test-secret',
    redirectUri: 'https://signalk.local:3000/oidc/callback',
    scope: 'openid email profile',
    defaultPermission: 'readonly',
    autoCreateUsers: true,
    providerName: 'SSO Login',
    autoLogin: false
  }

  function makeUserService(existingUsers: ExternalUser[] = []) {
    const created: ExternalUser[] = []
    const service: ExternalUserService = {
      findUserByProvider: async () => null,
      findUserByUsername: async (username) =>
        existingUsers.find((u) => u.username === username) ?? null,
      createUser: async (user) => {
        created.push(user)
      },
      updateUser: async () => undefined
    }
    return { service, created }
  }

  const verifiedUser: OIDCUserInfo = {
    sub: 'user-123',
    email: 'owner@example.com',
    emailVerified: true
  }

  describe('with autoCreateUsers disabled', () => {
    const config: OIDCConfig = {
      ...baseConfig,
      autoCreateUsers: false,
      adminUsers: ['owner@example.com']
    }

    it('should create a user on an identity allowlist', async () => {
      const { service, created } = makeUserService()

      const user = await findOrCreateOIDCUser(verifiedUser, config, {
        userService: service
      })

      expect(user).to.not.equal(null)
      expect(user?.type).to.equal('admin')
      expect(created).to.have.length(1)
    })

    it('should NOT create a user that is not allowlisted', async () => {
      const { service, created } = makeUserService()
      const unlisted = { ...verifiedUser, email: 'other@example.com' }

      const user = await findOrCreateOIDCUser(unlisted, config, {
        userService: service
      })

      expect(user).to.equal(null)
      expect(created).to.have.length(0)
    })

    it('should NOT create an allowlisted user whose email is unverified', async () => {
      const { service, created } = makeUserService()
      const unverified = { ...verifiedUser, emailVerified: false }

      const user = await findOrCreateOIDCUser(unverified, config, {
        userService: service
      })

      expect(user).to.equal(null)
      expect(created).to.have.length(0)
    })

    it('should NOT create a user matched only by groups', async () => {
      const { service, created } = makeUserService()
      const groupsConfig: OIDCConfig = {
        ...baseConfig,
        autoCreateUsers: false,
        adminGroups: ['admins']
      }
      const groupUser: OIDCUserInfo = { sub: 'user-456', groups: ['admins'] }

      const user = await findOrCreateOIDCUser(groupUser, groupsConfig, {
        userService: service
      })

      expect(user).to.equal(null)
      expect(created).to.have.length(0)
    })
  })

  describe('with autoCreateUsers enabled', () => {
    it('should create an allowlisted user with the mapped permission', async () => {
      const { service, created } = makeUserService()
      const config: OIDCConfig = {
        ...baseConfig,
        readwriteUsers: ['owner@example.com']
      }

      const user = await findOrCreateOIDCUser(verifiedUser, config, {
        userService: service
      })

      expect(user?.type).to.equal('readwrite')
      expect(created).to.have.length(1)
    })

    it('should create an unlisted user with defaultPermission', async () => {
      const { service } = makeUserService()
      const config: OIDCConfig = {
        ...baseConfig,
        adminUsers: ['someone-else@example.com']
      }

      const user = await findOrCreateOIDCUser(verifiedUser, config, {
        userService: service
      })

      expect(user?.type).to.equal('readonly')
    })
  })
})
