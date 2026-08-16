import { ExternalIdentityRecord, User } from '../security'
import { IdentityUserStore } from './provisioning'

export interface IdentityStoreBacking {
  /** The live user list; read on every call because the owner may replace it */
  users: () => User[]
  /** Write the given list as the new persistent state */
  persist: (users: User[]) => Promise<void>
}

/**
 * Identity provisioning storage over the security strategy's user list.
 * Every write is persisted first and applied to the in-memory list only
 * once that succeeded, so a failed save cannot leave a phantom account that
 * authenticates until the next config reload silently drops it.
 */
export function createIdentityUserStore(
  backing: IdentityStoreBacking
): IdentityUserStore {
  return {
    findByIdentity(identity: ExternalIdentityRecord): User | undefined {
      return backing
        .users()
        .find(
          (u) =>
            u.identity?.provider === identity.provider &&
            u.identity.subject === identity.subject &&
            u.identity.issuer === identity.issuer
        )
    },

    findByUsername(username: string): User | undefined {
      return backing.users().find((u) => u.username === username)
    },

    async createUser(user: User): Promise<void> {
      const users = backing.users()
      await backing.persist([...users, user])
      users.push(user)
    },

    async updateUser(
      user: User,
      updates: Partial<Pick<User, 'type' | 'identity'>>
    ): Promise<void> {
      const users = backing.users()
      await backing.persist(
        users.map((u) => (u === user ? { ...u, ...updates } : u))
      )
      Object.assign(user, updates)
    }
  }
}
