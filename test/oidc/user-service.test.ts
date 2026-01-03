import { expect } from 'chai'
import {
  ExternalUserService,
  ExternalUser,
  ProviderUserLookup
} from '../../src/oidc/types'

describe('ExternalUserService', () => {
  // In-memory implementation for testing the interface contract
  function createInMemoryUserService(): ExternalUserService & {
    users: ExternalUser[]
  } {
    const users: ExternalUser[] = []

    return {
      users,

      async findUserByProvider(
        lookup: ProviderUserLookup
      ): Promise<ExternalUser | null> {
        if (lookup.provider === 'oidc') {
          const { sub, issuer } = lookup.criteria
          const user = users.find((u) => {
            const oidc = u.providerData as
              | { sub: string; issuer: string }
              | undefined
            return oidc?.sub === sub && oidc?.issuer === issuer
          })
          return user || null
        }
        return null
      },

      async findUserByUsername(username: string): Promise<ExternalUser | null> {
        return users.find((u) => u.username === username) || null
      },

      async createUser(user: ExternalUser): Promise<void> {
        users.push(user)
      }
    }
  }

  describe('findUserByProvider', () => {
    it('should find user by OIDC sub and issuer', async () => {
      const service = createInMemoryUserService()
      service.users.push({
        username: 'testuser',
        type: 'readonly',
        providerData: {
          sub: 'user-123',
          issuer: 'https://auth.example.com'
        }
      })

      const lookup: ProviderUserLookup = {
        provider: 'oidc',
        criteria: { sub: 'user-123', issuer: 'https://auth.example.com' }
      }

      const user = await service.findUserByProvider(lookup)
      expect(user).to.not.equal(null)
      expect(user?.username).to.equal('testuser')
    })

    it('should return null when user not found', async () => {
      const service = createInMemoryUserService()

      const lookup: ProviderUserLookup = {
        provider: 'oidc',
        criteria: { sub: 'nonexistent', issuer: 'https://auth.example.com' }
      }

      const user = await service.findUserByProvider(lookup)
      expect(user).to.equal(null)
    })

    it('should not match if sub matches but issuer differs', async () => {
      const service = createInMemoryUserService()
      service.users.push({
        username: 'testuser',
        type: 'readonly',
        providerData: {
          sub: 'user-123',
          issuer: 'https://auth.example.com'
        }
      })

      const lookup: ProviderUserLookup = {
        provider: 'oidc',
        criteria: { sub: 'user-123', issuer: 'https://other-auth.com' }
      }

      const user = await service.findUserByProvider(lookup)
      expect(user).to.equal(null)
    })

    it('should return null for unknown provider', async () => {
      const service = createInMemoryUserService()
      service.users.push({
        username: 'testuser',
        type: 'readonly',
        providerData: { sub: 'user-123', issuer: 'https://auth.example.com' }
      })

      const lookup: ProviderUserLookup = {
        provider: 'ldap',
        criteria: { dn: 'cn=test,dc=example,dc=com' }
      }

      const user = await service.findUserByProvider(lookup)
      expect(user).to.equal(null)
    })
  })

  describe('findUserByUsername', () => {
    it('should find user by username', async () => {
      const service = createInMemoryUserService()
      service.users.push({
        username: 'alice',
        type: 'admin'
      })

      const user = await service.findUserByUsername('alice')
      expect(user).to.not.equal(null)
      expect(user?.type).to.equal('admin')
    })

    it('should return null when username not found', async () => {
      const service = createInMemoryUserService()

      const user = await service.findUserByUsername('nonexistent')
      expect(user).to.equal(null)
    })

    it('should find user without providerData', async () => {
      const service = createInMemoryUserService()
      service.users.push({
        username: 'localuser',
        type: 'readwrite'
      })

      const user = await service.findUserByUsername('localuser')
      expect(user).to.not.equal(null)
      expect(user?.providerData).to.equal(undefined)
    })
  })

  describe('createUser', () => {
    it('should create a new user', async () => {
      const service = createInMemoryUserService()

      await service.createUser({
        username: 'newuser',
        type: 'readonly',
        providerData: {
          sub: 'new-sub',
          issuer: 'https://auth.example.com'
        }
      })

      expect(service.users).to.have.length(1)
      expect(service.users[0].username).to.equal('newuser')
    })

    it('should allow creating user without providerData', async () => {
      const service = createInMemoryUserService()

      await service.createUser({
        username: 'localuser',
        type: 'admin'
      })

      expect(service.users).to.have.length(1)
      expect(service.users[0].providerData).to.equal(undefined)
    })
  })

  describe('ProviderUserLookup interface', () => {
    it('should support OIDC lookup criteria', () => {
      const lookup: ProviderUserLookup = {
        provider: 'oidc',
        criteria: {
          sub: 'abc123',
          issuer: 'https://auth.example.com'
        }
      }

      expect(lookup.provider).to.equal('oidc')
      expect(lookup.criteria.sub).to.equal('abc123')
      expect(lookup.criteria.issuer).to.equal('https://auth.example.com')
    })

    it('should support future LDAP lookup criteria', () => {
      const lookup: ProviderUserLookup = {
        provider: 'ldap',
        criteria: {
          dn: 'cn=user,dc=example,dc=com'
        }
      }

      expect(lookup.provider).to.equal('ldap')
      expect(lookup.criteria.dn).to.equal('cn=user,dc=example,dc=com')
    })
  })
})
