import { AuthenticationPermission, ExternalIdentity } from '@signalk/server-api'
import { ExternalIdentityRecord, User } from '../security'
import { createDebug } from '../debug'

const debug = createDebug('signalk-server:auth:provisioning')

/**
 * User storage as seen by identity provisioning. Implemented by the
 * security strategy, which owns the user list and its persistence.
 */
export interface IdentityUserStore {
  /** Match on provider + issuer + subject */
  findByIdentity(identity: ExternalIdentityRecord): User | undefined
  findByUsername(username: string): User | undefined
  /** Must persist before the record becomes visible to authentication */
  createUser(user: User): Promise<void>
  /** Must persist before the in-memory record changes */
  updateUser(
    user: User,
    updates: Partial<Pick<User, 'type' | 'identity'>>
  ): Promise<void>
}

export class UserCreationDisabledError extends Error {
  constructor() {
    super('User auto-creation is disabled')
    this.name = 'UserCreationDisabledError'
  }
}

const DEFAULT_PERMISSION: AuthenticationPermission = 'readonly'
const SUBJECT_SUFFIX_LENGTH = 8
const MAX_USERNAME_ATTEMPTS = 100

export function toIdentityRecord(
  providerId: string,
  identity: ExternalIdentity
): ExternalIdentityRecord {
  const record: ExternalIdentityRecord = {
    provider: providerId,
    subject: identity.subject
  }
  if (identity.issuer !== undefined) record.issuer = identity.issuer
  if (identity.email !== undefined) record.email = identity.email
  if (identity.name !== undefined) record.name = identity.name
  return record
}

function sameIdentityRecord(
  a: ExternalIdentityRecord | undefined,
  b: ExternalIdentityRecord
): boolean {
  return (
    a !== undefined &&
    a.provider === b.provider &&
    a.subject === b.subject &&
    a.issuer === b.issuer &&
    a.email === b.email &&
    a.name === b.name
  )
}

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g

/** Provider-supplied names are external input: strip control characters, trim */
function cleanUsername(value: string | undefined): string | undefined {
  const cleaned = value?.replace(CONTROL_CHARS, '').trim()
  return cleaned || undefined
}

function preferredUsername(
  providerId: string,
  identity: ExternalIdentity
): string {
  return (
    cleanUsername(identity.username) ??
    cleanUsername(identity.email) ??
    `${providerId}-${identity.subject}`
  )
}

/**
 * Maps identities established by authentication providers to local user
 * records: finds the record for a known identity (refreshing permission and
 * identity details), or creates one for a new identity when the provider
 * allows it. All calls are serialized so two concurrent first logins can
 * neither create two records for one identity nor claim the same username.
 */
export class UserProvisioner {
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private readonly store: IdentityUserStore) {}

  resolve(
    providerId: string,
    autoCreateUsers: boolean,
    identity: ExternalIdentity
  ): Promise<User> {
    const run = this.queue.then(() =>
      this.resolveNow(providerId, autoCreateUsers, identity)
    )
    this.queue = run.catch(() => undefined)
    return run
  }

  private async resolveNow(
    providerId: string,
    autoCreateUsers: boolean,
    identity: ExternalIdentity
  ): Promise<User> {
    const record = toIdentityRecord(providerId, identity)
    const existing = this.store.findByIdentity(record)

    if (existing) {
      const updates: Partial<Pick<User, 'type' | 'identity'>> = {}
      if (identity.permission && identity.permission !== existing.type) {
        debug(
          `${providerId}: ${existing.username} permission ${existing.type} -> ${identity.permission}`
        )
        updates.type = identity.permission
      }
      if (!sameIdentityRecord(existing.identity, record)) {
        updates.identity = record
      }
      if (Object.keys(updates).length > 0) {
        await this.store.updateUser(existing, updates)
      }
      return existing
    }

    if (!autoCreateUsers) {
      throw new UserCreationDisabledError()
    }

    const user: User = {
      username: this.freeUsername(
        preferredUsername(providerId, identity),
        record
      ),
      type: identity.permission ?? DEFAULT_PERMISSION,
      identity: record
    }
    debug(`${providerId}: creating user ${user.username} (${user.type})`)
    await this.store.createUser(user)
    return user
  }

  /**
   * Usernames suggested by providers are not unique (two accounts may share
   * a preferred_username), so a taken name gets a subject-derived suffix and,
   * failing that, a counter.
   */
  private freeUsername(
    preferred: string,
    record: ExternalIdentityRecord
  ): string {
    if (!this.store.findByUsername(preferred)) {
      return preferred
    }
    const withSubject = `${preferred}-${record.subject.substring(0, SUBJECT_SUFFIX_LENGTH)}`
    if (!this.store.findByUsername(withSubject)) {
      return withSubject
    }
    for (let n = 2; n <= MAX_USERNAME_ATTEMPTS; n++) {
      const candidate = `${withSubject}-${n}`
      if (!this.store.findByUsername(candidate)) {
        return candidate
      }
    }
    throw new Error(`Unable to allocate a username for ${preferred}`)
  }
}
