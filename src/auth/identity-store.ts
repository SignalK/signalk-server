import { ExternalIdentityRecord, User } from '../security'
import { IdentityUserStore } from './provisioning'

export interface IdentityStoreBacking {
  /** The live user list; read on every call because the owner may replace it */
  users: () => User[]
  /** Write the given list as the new persistent state */
  persist: (users: User[]) => Promise<void>
}

function sameIdentity(
  a: ExternalIdentityRecord | undefined,
  b: ExternalIdentityRecord | undefined
): boolean {
  return (
    a !== undefined &&
    b !== undefined &&
    a.provider === b.provider &&
    a.subject === b.subject &&
    a.issuer === b.issuer
  )
}

/**
 * Identity provisioning storage over the security strategy's user list.
 * Every write is persisted first and applied to the in-memory list only
 * once that succeeded, so a failed save cannot leave a phantom account that
 * authenticates until the next config reload silently drops it. The list is
 * re-read after the save because the owner may have replaced it meanwhile
 * (admin user operations reload it from disk).
 */
export function createIdentityUserStore(
  backing: IdentityStoreBacking
): IdentityUserStore {
  const findByIdentity = (identity: ExternalIdentityRecord) =>
    backing.users().find((u) => sameIdentity(u.identity, identity))

  return {
    findByIdentity,

    findByUsername(username: string): User | undefined {
      return backing.users().find((u) => u.username === username)
    },

    async createUser(user: User): Promise<void> {
      await backing.persist([...backing.users(), user])
      const users = backing.users()
      if (!users.some((u) => sameIdentity(u.identity, user.identity))) {
        users.push(user)
      }
    },

    async updateUser(
      user: User,
      updates: Partial<Pick<User, 'type' | 'identity'>>
    ): Promise<void> {
      const key = user.identity
      const isTarget = (u: User) =>
        u === user || (key !== undefined && sameIdentity(u.identity, key))
      await backing.persist(
        backing.users().map((u) => (isTarget(u) ? { ...u, ...updates } : u))
      )
      Object.assign(backing.users().find(isTarget) ?? user, updates)
    }
  }
}
