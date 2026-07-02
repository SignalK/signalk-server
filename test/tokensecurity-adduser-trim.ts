import { expect } from 'chai'
import type { SecurityConfig, User } from '../src/security'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const tokenSecurityFactory = require('../dist/tokensecurity.js')

interface LoginResult {
  statusCode: number
  token?: string
}

// userId is typed unknown because addUser receives raw request bodies, where
// a malformed value (number, missing, ...) is exactly what we want to test.
interface NewUser {
  userId: unknown
  type: string
  password?: string
}

interface AddUserStrategy {
  addUser(
    config: Partial<SecurityConfig>,
    user: NewUser,
    callback: (err: Error | null, config?: SecurityConfig) => void
  ): void
  login(name: string, password: string): Promise<LoginResult>
}

function makeStrategy(): AddUserStrategy {
  // setupApp() registers express routes during construction; stub the
  // router verbs as no-ops since this test only exercises addUser().
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

function addUser(
  strategy: AddUserStrategy,
  config: Partial<SecurityConfig>,
  user: NewUser
): Promise<SecurityConfig> {
  return new Promise((resolve, reject) => {
    strategy.addUser(config, user, (err, theConfig) => {
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

describe('tokensecurity addUser', () => {
  it('trims a trailing space from the username', async () => {
    const config: Partial<SecurityConfig> = { users: [] }
    const result = await addUser(makeStrategy(), config, {
      userId: 'admin ',
      type: 'admin',
      password: 'secret'
    })
    expect(usernames(result)).to.deep.equal(['admin'])
  })

  it('trims a leading space from the username', async () => {
    const config: Partial<SecurityConfig> = { users: [] }
    const result = await addUser(makeStrategy(), config, {
      userId: ' admin',
      type: 'admin',
      password: 'secret'
    })
    expect(usernames(result)).to.deep.equal(['admin'])
  })

  it('rejects a username that is empty after trimming', async () => {
    let error: Error | undefined
    try {
      await addUser(
        makeStrategy(),
        { users: [] },
        {
          userId: '   ',
          type: 'admin',
          password: 'secret'
        }
      )
    } catch (err) {
      error = err as Error
    }
    expect(error).to.be.an('error')
  })

  it('rejects a non-string username via the callback, not a throw', async () => {
    let error: Error | undefined
    try {
      await addUser(
        makeStrategy(),
        { users: [] },
        {
          userId: 42,
          type: 'admin',
          password: 'secret'
        }
      )
    } catch (err) {
      error = err as Error
    }
    expect(error).to.be.an('error')
  })

  it('treats a padded username as a duplicate of the trimmed one', async () => {
    const config: Partial<SecurityConfig> = { users: [] }
    const strategy = makeStrategy()
    await addUser(strategy, config, {
      userId: 'admin',
      type: 'admin',
      password: 'secret'
    })
    let error: Error | undefined
    try {
      await addUser(strategy, config, {
        userId: ' admin ',
        type: 'admin',
        password: 'secret'
      })
    } catch (err) {
      error = err as Error
    }
    expect(error).to.be.an('error')
    expect(config.users).to.have.length(1)
  })
})

describe('tokensecurity login', () => {
  it('logs in when the typed username has stray surrounding spaces', async () => {
    const strategy = makeStrategy()
    // addUser reassigns the strategy's live config to the object passed
    // here, so carry the secretKey through or token signing at login fails.
    const config: Partial<SecurityConfig> = { users: [], secretKey: 'test-key' }
    await addUser(strategy, config, {
      userId: 'admin',
      type: 'admin',
      password: 'secret'
    })
    const result = await strategy.login(' admin ', 'secret')
    expect(result.statusCode).to.equal(200)
    expect(result.token).to.be.a('string')
  })
})
