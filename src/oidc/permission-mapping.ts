/*
 * Copyright 2025 Matti Airas
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type {
  OIDCConfig,
  OIDCIdentityClaim,
  OIDCUserInfo,
  SignalKPermission
} from './types'

const DEFAULT_IDENTITY_CLAIM: OIDCIdentityClaim = 'email'

/** Permission levels that can be granted by a mapping rule (never 'readonly') */
type MappedPermission = 'admin' | 'readwrite'

/**
 * Check if two arrays have any common elements
 */
function hasIntersection(arr1: string[], arr2: string[]): boolean {
  const set1 = new Set(arr1)
  return arr2.some((item) => set1.has(item))
}

/**
 * Match the user's groups against adminGroups/readwriteGroups.
 *
 * **Limitations:**
 * - Group matching is **case-sensitive** (e.g., 'Admins' ≠ 'admins')
 * - Groups must be present in the **ID token** (not userinfo endpoint)
 * - Use `groupsAttribute` config to specify a custom claim name
 *
 * @returns The matched permission, or undefined if no group matched
 */
function matchGroups(
  userGroups: string[] | undefined,
  config: OIDCConfig
): MappedPermission | undefined {
  if (!userGroups || userGroups.length === 0) {
    return undefined
  }

  // Check admin groups first (highest priority)
  if (config.adminGroups && config.adminGroups.length > 0) {
    if (hasIntersection(userGroups, config.adminGroups)) {
      return 'admin'
    }
  }

  // Check readwrite groups
  if (config.readwriteGroups && config.readwriteGroups.length > 0) {
    if (hasIntersection(userGroups, config.readwriteGroups)) {
      return 'readwrite'
    }
  }

  return undefined
}

/**
 * Resolve the identity value to match adminUsers/readwriteUsers against.
 *
 * When the identity claim is 'email', the token must assert
 * `email_verified: true`. Without this gate, any provider that lets a user
 * enter an arbitrary, unverified email address could be used to claim an
 * allowlisted identity and escalate to admin.
 *
 * @returns The identity value, or undefined if unavailable or unverified
 */
function resolveIdentity(
  userInfo: OIDCUserInfo,
  config: OIDCConfig
): string | undefined {
  const claim = config.identityClaim ?? DEFAULT_IDENTITY_CLAIM
  switch (claim) {
    case 'email':
      return userInfo.emailVerified === true ? userInfo.email : undefined
    case 'preferred_username':
      return userInfo.preferredUsername
    case 'sub':
      return userInfo.sub
  }
}

/**
 * Match the user's identity (per identityClaim) against the
 * adminUsers/readwriteUsers allowlists.
 *
 * Matching is case-insensitive for 'email' and 'preferred_username'.
 * 'sub' is an opaque, case-sensitive identifier (OIDC Core §2) and is
 * compared exactly.
 *
 * @returns The matched permission, or undefined if no list matched
 */
export function matchIdentityList(
  userInfo: OIDCUserInfo,
  config: OIDCConfig
): MappedPermission | undefined {
  const identity = resolveIdentity(userInfo, config)
  if (!identity) {
    return undefined
  }

  const caseSensitive =
    (config.identityClaim ?? DEFAULT_IDENTITY_CLAIM) === 'sub'
  const normalize = (value: string) =>
    caseSensitive ? value.trim() : value.trim().toLowerCase()
  const normalizedIdentity = normalize(identity)
  const listContainsIdentity = (list: string[] | undefined) =>
    !!list && list.some((entry) => normalize(entry) === normalizedIdentity)

  if (listContainsIdentity(config.adminUsers)) {
    return 'admin'
  }
  if (listContainsIdentity(config.readwriteUsers)) {
    return 'readwrite'
  }
  return undefined
}

/**
 * Map an authenticated OIDC user to a Signal K permission level
 *
 * Priority:
 * 1. Group mappings (adminGroups, then readwriteGroups)
 * 2. Identity allowlists (adminUsers, then readwriteUsers)
 * 3. defaultPermission (typically 'readonly')
 *
 * Behavior is unchanged from group-only mapping when the identity
 * allowlists are not configured.
 *
 * @param userInfo - User information extracted from validated OIDC claims
 * @param config - OIDC configuration with permission mappings
 * @returns The mapped permission level
 */
export function mapUserToPermission(
  userInfo: OIDCUserInfo,
  config: OIDCConfig
): SignalKPermission {
  return (
    matchGroups(userInfo.groups, config) ??
    matchIdentityList(userInfo, config) ??
    config.defaultPermission
  )
}
