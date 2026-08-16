import { expect } from 'chai'
import {
  IdentityUserStore,
  UserCreationDisabledError,
  UserProvisioner
} from '../../src/auth/provisioning'
import { createIdentityUserStore } from '../../src/auth/identity-store'
import { User } from '../../src/security'

interface Harness {
  store: IdentityUserStore
  users: User[]
  persisted: User[][]
  failNextPersist: (error: Error) => void
  /** Simulates the owner reloading the list from disk while a save is in flight */
  replaceListDuringNextPersist: () => void
  provisioner: UserProvisioner
}

function harness(initial: User[] = []): Harness {
  let users = [...initial]
  const persisted: User[][] = []
  let failure: Error | undefined
  let replaceOnce = false
  const store = createIdentityUserStore({
    users: () => users,
    persist: async (next) => {
      if (failure) {
        const err = failure
        failure = undefined
        throw err
      }
      persisted.push(structuredClone(next))
      if (replaceOnce) {
        // a reload from disk that raced the save and does not yet contain it
        replaceOnce = false
        users = structuredClone(users)
      }
    }
  })
  return {
    store,
    get users() {
      return users
    },
    persisted,
    failNextPersist: (error) => {
      failure = error
    },
    replaceListDuringNextPersist: () => {
      replaceOnce = true
    },
    provisioner: new UserProvisioner(store)
  }
}

const ISSUER = 'https://idp.example.com'

describe('UserProvisioner', () => {
  it('creates a readonly user with the suggested username on first login', async () => {
    const h = harness()
    const user = await h.provisioner.resolve('oidc', true, {
      subject: 'sub-1',
      issuer: ISSUER,
      username: 'alice',
      email: 'alice@example.com',
      name: 'Alice'
    })
    expect(user).to.deep.equal({
      username: 'alice',
      type: 'readonly',
      identity: {
        provider: 'oidc',
        subject: 'sub-1',
        issuer: ISSUER,
        email: 'alice@example.com',
        name: 'Alice'
      }
    })
    expect(h.users).to.deep.equal([user])
  })

  it('falls back to email and then to provider-subject for the username', async () => {
    const h = harness()
    const byEmail = await h.provisioner.resolve('oidc', true, {
      subject: 's1',
      email: 'bob@example.com'
    })
    expect(byEmail.username).to.equal('bob@example.com')
    const bySubject = await h.provisioner.resolve('github', true, {
      subject: '12345'
    })
    expect(bySubject.username).to.equal('github-12345')
  })

  it('strips control characters and whitespace from a suggested username', async () => {
    const h = harness()
    const user = await h.provisioner.resolve('oidc', true, {
      subject: 's1',
      username: ' al\u0007ice\n'
    })
    expect(user.username).to.equal('alice')
    const blank = await h.provisioner.resolve('oidc', true, {
      subject: 's2',
      username: '\u0001'
    })
    expect(blank.username).to.equal('oidc-s2')
  })

  it('applies the permission mapped by the provider', async () => {
    const h = harness()
    const user = await h.provisioner.resolve('oidc', true, {
      subject: 'sub-1',
      permission: 'admin'
    })
    expect(user.type).to.equal('admin')
  })

  it('persists before the record becomes visible and leaves memory untouched when persisting fails', async () => {
    const h = harness()
    h.failNextPersist(new Error('ENOSPC'))
    let error: Error | undefined
    try {
      await h.provisioner.resolve('oidc', true, { subject: 'sub-1' })
    } catch (err) {
      error = err as Error
    }
    expect(error?.message).to.equal('ENOSPC')
    expect(h.users).to.deep.equal([])
    expect(h.persisted).to.deep.equal([])

    const user = await h.provisioner.resolve('oidc', true, { subject: 'sub-1' })
    expect(h.users).to.deep.equal([user])
    expect(h.persisted).to.have.length(1)
  })

  it('finds a known identity by provider, issuer and subject', async () => {
    const h = harness()
    const first = await h.provisioner.resolve('oidc', true, {
      subject: 'sub-1',
      issuer: ISSUER,
      username: 'alice'
    })
    const again = await h.provisioner.resolve('oidc', true, {
      subject: 'sub-1',
      issuer: ISSUER,
      username: 'alice'
    })
    expect(again).to.equal(first)
    expect(h.users).to.have.length(1)
  })

  it('treats the same subject at another issuer or provider as a different user', async () => {
    const h = harness()
    await h.provisioner.resolve('oidc', true, {
      subject: 'sub-1',
      issuer: ISSUER
    })
    await h.provisioner.resolve('oidc', true, {
      subject: 'sub-1',
      issuer: 'https://other.example.com'
    })
    await h.provisioner.resolve('github', true, { subject: 'sub-1' })
    expect(h.users.map((u) => u.username)).to.deep.equal([
      'oidc-sub-1',
      'oidc-sub-1-sub-1',
      'github-sub-1'
    ])
  })

  it('updates permission and identity details of a known user, persisting first', async () => {
    const h = harness()
    const user = await h.provisioner.resolve('oidc', true, {
      subject: 'sub-1',
      permission: 'readonly',
      email: 'old@example.com'
    })
    await h.provisioner.resolve('oidc', true, {
      subject: 'sub-1',
      permission: 'admin',
      email: 'new@example.com'
    })
    expect(user.type).to.equal('admin')
    expect(user.identity?.email).to.equal('new@example.com')
    expect(h.persisted).to.have.length(2)
    expect(h.persisted[1][0].type).to.equal('admin')
  })

  it('still logs the user in when a refresh of email or name cannot be written', async () => {
    const h = harness()
    const user = await h.provisioner.resolve('oidc', true, {
      subject: 'sub-1',
      permission: 'readonly',
      email: 'old@example.com'
    })
    h.failNextPersist(new Error('EROFS'))
    const again = await h.provisioner.resolve('oidc', true, {
      subject: 'sub-1',
      permission: 'readonly',
      email: 'new@example.com'
    })
    expect(again).to.equal(user)
    expect(user.identity?.email).to.equal('old@example.com')
    expect(h.persisted).to.have.length(1)
  })

  it('refuses the login when a permission change cannot be written', async () => {
    const h = harness()
    const user = await h.provisioner.resolve('oidc', true, {
      subject: 'sub-1',
      permission: 'admin'
    })
    h.failNextPersist(new Error('EROFS'))
    let error: Error | undefined
    try {
      await h.provisioner.resolve('oidc', true, {
        subject: 'sub-1',
        permission: 'readonly'
      })
    } catch (err) {
      error = err as Error
    }
    expect(error?.message).to.equal('EROFS')
    expect(user.type).to.equal('admin')
    expect(h.persisted).to.have.length(1)
  })

  it('does not write when nothing changed', async () => {
    const h = harness()
    const identity = {
      subject: 'sub-1',
      permission: 'admin' as const,
      name: 'A'
    }
    await h.provisioner.resolve('oidc', true, identity)
    await h.provisioner.resolve('oidc', true, identity)
    expect(h.persisted).to.have.length(1)
  })

  it('leaves the permission alone when the provider does not map one', async () => {
    const h = harness([
      {
        username: 'alice',
        type: 'admin',
        identity: { provider: 'oidc', subject: 'sub-1' }
      }
    ])
    const user = await h.provisioner.resolve('oidc', true, { subject: 'sub-1' })
    expect(user.type).to.equal('admin')
    expect(h.persisted).to.deep.equal([])
  })

  it('applies writes to the list that is live after the save, not the one captured before it', async () => {
    const h = harness()
    h.replaceListDuringNextPersist()
    const created = await h.provisioner.resolve('oidc', true, {
      subject: 'sub-1',
      permission: 'readonly'
    })
    expect(h.users).to.deep.equal([created])

    h.replaceListDuringNextPersist()
    await h.provisioner.resolve('oidc', true, {
      subject: 'sub-1',
      permission: 'admin'
    })
    expect(h.users).to.have.length(1)
    expect(h.users[0].type).to.equal('admin')
    expect(h.persisted).to.have.length(2)
  })

  it('rejects unknown identities when auto-creation is off', async () => {
    const h = harness()
    let error: unknown
    try {
      await h.provisioner.resolve('oidc', false, { subject: 'sub-1' })
    } catch (err) {
      error = err
    }
    expect(error).to.be.instanceOf(UserCreationDisabledError)
    expect(h.users).to.deep.equal([])
  })

  it('still resolves known identities when auto-creation is off', async () => {
    const h = harness()
    await h.provisioner.resolve('oidc', true, { subject: 'sub-1' })
    const user = await h.provisioner.resolve('oidc', false, {
      subject: 'sub-1'
    })
    expect(user.username).to.equal('oidc-sub-1')
  })

  it('suffixes a taken username with the subject prefix, then a counter', async () => {
    const h = harness([{ username: 'alice', type: 'admin', password: 'x' }])
    const second = await h.provisioner.resolve('oidc', true, {
      subject: 'abcdefghijkl',
      username: 'alice'
    })
    expect(second.username).to.equal('alice-abcdefgh')
    const third = await h.provisioner.resolve('oidc', true, {
      subject: 'abcdefghXYZ',
      username: 'alice'
    })
    expect(third.username).to.equal('alice-abcdefgh-2')
  })

  it('serializes concurrent first logins so one identity gets exactly one record', async () => {
    const h = harness()
    const identity = { subject: 'sub-1', username: 'alice' }
    const results = await Promise.all([
      h.provisioner.resolve('oidc', true, identity),
      h.provisioner.resolve('oidc', true, identity),
      h.provisioner.resolve('oidc', true, {
        subject: 'sub-2',
        username: 'alice'
      })
    ])
    expect(results[0]).to.equal(results[1])
    expect(h.users.map((u) => u.username)).to.deep.equal([
      'alice',
      'alice-sub-2'
    ])
  })

  it('keeps serving after a failed provisioning attempt', async () => {
    const h = harness()
    h.failNextPersist(new Error('boom'))
    await h.provisioner
      .resolve('oidc', true, { subject: 'sub-1' })
      .catch(() => {})
    const user = await h.provisioner.resolve('oidc', true, { subject: 'sub-2' })
    expect(user.username).to.equal('oidc-sub-2')
  })
})
