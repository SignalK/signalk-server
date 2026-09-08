import { expect } from 'chai'
import type { SecurityConfig, User } from '../src/security'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const tokenSecurityFactory = require('../dist/tokensecurity.js')

interface DeleteUserStrategy {
  deleteUser(
    config: Partial<SecurityConfig>,
    username: string,
    callback: (err: Error | null, config?: SecurityConfig) => void
  ): void
}

function makeStrategy(): DeleteUserStrategy {
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

describe('tokensecurity deleteUser', () => {
  it('removes every record carrying the username', async () => {
    const users: User[] = [
      {
        username: 'alice',
        type: 'admin',
        identity: { provider: 'oidc', subject: 'a' }
      },
      { username: 'bob', type: 'readonly' },
      {
        username: 'alice',
        type: 'readonly',
        identity: { provider: 'oidc', subject: 'b' }
      }
    ]
    const config = await new Promise<SecurityConfig>((resolve, reject) =>
      makeStrategy().deleteUser({ users }, 'alice', (err, result) =>
        err ? reject(err) : resolve(result!)
      )
    )
    expect(config.users.map((u) => u.username)).to.deep.equal(['bob'])
  })
})
