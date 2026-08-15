import { expect } from 'chai'
import type { SecurityConfig, User } from '../src/security'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const tokenSecurityFactory = require('../dist/tokensecurity.js')

interface UserData {
  userId: string
  type: string
  isOIDC?: boolean
  oidc?: { issuer?: string; email?: string; name?: string; sub?: string }
}

interface UsersStrategy {
  deleteUser(
    config: Partial<SecurityConfig>,
    username: string,
    callback: (err: Error | null, config?: SecurityConfig) => void
  ): void
  getUsers(config: Partial<SecurityConfig>): UserData[]
}

function makeStrategy(): UsersStrategy {
  // setupApp() registers express routes during construction; stub the
  // router verbs as no-ops since this test only exercises user records.
  const noop = () => undefined
  const app = {
    config: {},
    use: noop,
    get: noop,
    post: noop,
    put: noop,
    delete: noop
  }
  return tokenSecurityFactory(app, { secretKey: 'test-key' })
}

function deleteUser(
  strategy: UsersStrategy,
  config: Partial<SecurityConfig>,
  username: string
): Promise<SecurityConfig> {
  return new Promise((resolve, reject) => {
    strategy.deleteUser(config, username, (err, theConfig) => {
      if (err) {
        reject(err)
      } else {
        resolve(theConfig as SecurityConfig)
      }
    })
  })
}

const usernames = (config: { users?: User[] }): string[] =>
  (config.users ?? []).map((u) => u.username)

describe('tokensecurity deleteUser', () => {
  it('removes the single record for a unique username', async () => {
    const config: Partial<SecurityConfig> = {
      users: [
        { username: 'alice', type: 'admin' },
        { username: 'bob', type: 'readonly' }
      ]
    }
    const result = await deleteUser(makeStrategy(), config, 'alice')
    expect(usernames(result)).to.deep.equal(['bob'])
  })

  it('removes every record when duplicates share the username', async () => {
    const config: Partial<SecurityConfig> = {
      users: [
        { username: 'alice', type: 'admin' },
        {
          username: 'alice',
          type: 'readonly',
          oidc: { sub: 'sub-2', issuer: 'https://idp.example.com' }
        },
        { username: 'bob', type: 'readonly' }
      ]
    }
    const result = await deleteUser(makeStrategy(), config, 'alice')
    expect(usernames(result)).to.deep.equal(['bob'])
  })

  it('leaves the config unchanged for an unknown username', async () => {
    const config: Partial<SecurityConfig> = {
      users: [{ username: 'alice', type: 'admin' }]
    }
    const result = await deleteUser(makeStrategy(), config, 'carol')
    expect(usernames(result)).to.deep.equal(['alice'])
  })
})

describe('tokensecurity getUsers', () => {
  it('surfaces the OIDC sub so duplicate usernames are distinguishable', () => {
    const config: Partial<SecurityConfig> = {
      users: [
        { username: 'alice', type: 'admin' },
        {
          username: 'alice',
          type: 'readonly',
          oidc: {
            sub: 'sub-2',
            issuer: 'https://idp.example.com',
            email: 'alice@example.com'
          }
        }
      ]
    }
    const users = makeStrategy().getUsers(config)
    expect(users).to.have.length(2)
    expect(users[0].isOIDC).to.equal(false)
    expect(users[0].oidc).to.equal(undefined)
    expect(users[1].isOIDC).to.equal(true)
    expect(users[1].oidc?.sub).to.equal('sub-2')
    expect(users[1].oidc?.issuer).to.equal('https://idp.example.com')
  })
})
