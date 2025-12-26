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

import type { OIDCConfig, SignalKPermission } from './types'

/**
 * Check if two arrays have any common elements
 */
function hasIntersection(arr1: string[], arr2: string[]): boolean {
  const set1 = new Set(arr1)
  return arr2.some((item) => set1.has(item))
}

/**
 * Map OIDC groups to Signal K permission level
 *
 * Priority:
 * 1. If user is in any admin group → 'admin'
 * 2. Else if user is in any readwrite group → 'readwrite'
 * 3. Else → defaultPermission (typically 'readonly')
 *
 * @param userGroups - Groups the user belongs to (from OIDC claims)
 * @param config - OIDC configuration with group mappings
 * @returns The mapped permission level
 */
export function mapGroupsToPermission(
  userGroups: string[] | undefined,
  config: OIDCConfig
): SignalKPermission {
  // If user has no groups, return default permission
  if (!userGroups || userGroups.length === 0) {
    return config.defaultPermission
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

  // Fall back to default permission
  return config.defaultPermission
}
