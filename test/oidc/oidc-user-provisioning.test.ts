import { expect } from 'chai'
import { findOrCreateOIDCUser } from '../../src/oidc/oidc-auth'
import {
  ExternalUser,
  ExternalUserService,
  OIDCConfig,
  OIDCUserInfo,
  ProviderUserLookup,
  UsernameConflictError
} from '../../src/oidc/types'

const ISSUER = 'https://idp.example.com'

function makeConfig(overrides: Partial<OIDCConfig> = {}): OIDCConfig {
  const config: OIDCConfig = {
    enabled: true,
    issuer: ISSUER,
    clientId: 'client',
    clientSecret: 'secret',
    redirectUri: 'http://localhost:3000/callback',
    scope: 'openid profile email',
    defaultPermission: 'readonly',
    autoCreateUsers: true,
    providerName: 'SSO Login',
    autoLogin: false
  }
  return { ...config, ...overrides }
}

/** In-memory user store mirroring tokensecurity's externalUserService. */
function makeUserService(initial: ExternalUser[] = []) {
  const users: ExternalUser[] = [...initial]
  const service: ExternalUserService = {
    async findUserByProvider(lookup: ProviderUserLookup) {
      if (lookup.provider !== 'oidc') {
        return null
      }
      const { sub, issuer } = lookup.criteria
      const found = users.find((user) => {
        const oidc = user.providerData?.oidc as
          { sub?: string; issuer?: string } | undefined
        return oidc?.sub === sub && oidc?.issuer === issuer
      })
      if (!found) {
        return null
      }
      // Mirror production: providerData holds the OIDC metadata directly
      return {
        username: found.username,
        type: found.type,
        providerData: found.providerData?.oidc as
          Record<string, unknown> | undefined
      }
    },
    async findUserByUsername(username: string) {
      return users.find((user) => user.username === username) ?? null
    },
    async createUser(user: ExternalUser) {
      if (users.some((u) => u.username === user.username)) {
        throw new UsernameConflictError(user.username)
      }
      users.push(user)
    },
    async updateUser(username, updates) {
      const user = users.find((u) => u.username === username)
      if (!user) {
        throw new Error(`User not found: ${username}`)
      }
      if (updates.type) {
        user.type = updates.type
      }
      if (updates.providerData) {
        user.providerData = updates.providerData
      }
    }
  }
  return { service, users }
}

function oidcUser(username: string, sub: string): ExternalUser {
  return {
    username,
    type: 'readonly',
    providerData: { oidc: { sub, issuer: ISSUER } }
  }
}

function userInfo(sub: string, preferredUsername: string): OIDCUserInfo {
  return { sub, preferredUsername }
}

/**
 * Hold every request at the availability check until `count` of them have
 * seen a name as free, so all of them race into createUser together.
 */
function forceCreationRace(service: ExternalUserService, count: number) {
  let seenFree = 0
  let racing = true
  let release!: () => void
  const allChecked = new Promise<void>((resolve) => {
    release = resolve
  })
  const lookup = service.findUserByUsername.bind(service)
  service.findUserByUsername = async (username: string) => {
    const result = await lookup(username)
    if (racing && result === null) {
      if (++seenFree === count) {
        racing = false
        release()
      }
      await allChecked
    }
    return result
  }
}

describe('OIDC user provisioning', () => {
  it('uses the preferred username when no record claims it', async () => {
    const { service, users } = makeUserService()

    const result = await findOrCreateOIDCUser(
      userInfo('sub-1', 'alice'),
      makeConfig(),
      { userService: service }
    )

    expect(result?.username).to.equal('alice')
    expect(users.map((u) => u.username)).to.deep.equal(['alice'])
  })

  it('reuses the record matching the same subject', async () => {
    const { service, users } = makeUserService([oidcUser('alice', 'sub-1')])

    const result = await findOrCreateOIDCUser(
      userInfo('sub-1', 'alice'),
      makeConfig(),
      { userService: service }
    )

    expect(result?.username).to.equal('alice')
    expect(users).to.have.length(1)
  })

  it('renames when a local user already holds the name', async () => {
    const { service, users } = makeUserService([
      { username: 'alice', type: 'admin' }
    ])

    const result = await findOrCreateOIDCUser(
      userInfo('sub-abcdefgh12345', 'alice'),
      makeConfig(),
      { userService: service }
    )

    expect(result?.username).to.equal('alice-sub-abcd')
    expect(users).to.have.length(2)
  })

  it('renames when a different OIDC identity already holds the name', async () => {
    const { service, users } = makeUserService([oidcUser('alice', 'sub-1')])

    const result = await findOrCreateOIDCUser(
      userInfo('sub-2', 'alice'),
      makeConfig(),
      { userService: service }
    )

    expect(result?.username).to.equal('alice-sub-2')
    expect(users.map((u) => u.username)).to.deep.equal(['alice', 'alice-sub-2'])
  })

  it('keeps deriving a free name when subjects share a prefix', async () => {
    const { service, users } = makeUserService([
      oidcUser('alice', 'sub-1'),
      oidcUser('alice-subjectA', 'subjectAAAA')
    ])

    const result = await findOrCreateOIDCUser(
      userInfo('subjectABBB', 'alice'),
      makeConfig(),
      { userService: service }
    )

    expect(result?.username).to.equal('alice-subjectA-1')
    expect(users).to.have.length(3)
  })

  it('gives concurrent requests sharing a preferred name unique usernames', async () => {
    const { service, users } = makeUserService()
    forceCreationRace(service, 2)

    const [a, b] = await Promise.all([
      findOrCreateOIDCUser(userInfo('sub-aaaa1111', 'alice'), makeConfig(), {
        userService: service
      }),
      findOrCreateOIDCUser(userInfo('sub-bbbb2222', 'alice'), makeConfig(), {
        userService: service
      })
    ])

    const usernames = users.map((u) => u.username)
    expect(new Set(usernames).size).to.equal(2)
    expect([a?.username, b?.username]).to.have.members(usernames)
  })

  it('provisions many concurrent identities sharing a name and subject prefix', async () => {
    const { service, users } = makeUserService()
    const subs = [1, 2, 3, 4, 5, 6].map((n) => `samepref-${n}`)
    forceCreationRace(service, subs.length)

    const results = await Promise.all(
      subs.map((sub) =>
        findOrCreateOIDCUser(userInfo(sub, 'alice'), makeConfig(), {
          userService: service
        })
      )
    )

    const usernames = users.map((u) => u.username)
    expect(new Set(usernames).size).to.equal(subs.length)
    expect(results.map((r) => r?.username)).to.have.members(usernames)
  })

  it('creates a single record when the same identity provisions concurrently', async () => {
    const { service, users } = makeUserService()
    forceCreationRace(service, 2)

    const [a, b] = await Promise.all([
      findOrCreateOIDCUser(userInfo('sub-1', 'alice'), makeConfig(), {
        userService: service
      }),
      findOrCreateOIDCUser(userInfo('sub-1', 'alice'), makeConfig(), {
        userService: service
      })
    ])

    expect(users).to.have.length(1)
    expect(a?.username).to.equal('alice')
    expect(b?.username).to.equal('alice')
  })

  it('does not create a user when auto-creation is disabled', async () => {
    const { service, users } = makeUserService()

    const result = await findOrCreateOIDCUser(
      userInfo('sub-1', 'alice'),
      makeConfig({ autoCreateUsers: false }),
      { userService: service }
    )

    expect(result).to.equal(null)
    expect(users).to.be.empty
  })

  it('propagates storage failures from createUser unchanged', async () => {
    const { service } = makeUserService()
    service.createUser = async () => {
      throw new Error('disk full')
    }

    try {
      await findOrCreateOIDCUser(userInfo('sub-1', 'alice'), makeConfig(), {
        userService: service
      })
      expect.fail('expected findOrCreateOIDCUser to reject')
    } catch (err) {
      expect((err as Error).message).to.equal('disk full')
    }
  })

  it('gives up when every candidate keeps losing the creation race', async () => {
    const service: ExternalUserService = {
      findUserByProvider: async () => null,
      findUserByUsername: async () => null,
      createUser: async (user) => {
        throw new UsernameConflictError(user.username)
      },
      updateUser: async () => undefined
    }

    try {
      await findOrCreateOIDCUser(userInfo('sub-1', 'alice'), makeConfig(), {
        userService: service
      })
      expect.fail('expected findOrCreateOIDCUser to reject')
    } catch (err) {
      expect((err as Error).message).to.match(/after 100 attempts/)
    }
  })
})
