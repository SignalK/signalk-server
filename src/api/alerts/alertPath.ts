/**
 * Validation of the path that identifies an alert.
 *
 * The path is the identity, and it arrives from REST, from deltas and from
 * plugins, so every surface validates it the same way here rather than each
 * trusting the others.
 */

import type { Path } from '@signalk/server-api'
import { InvalidAlertPathError } from './errors'

const MAX_PATH_LENGTH = 255

const SEGMENT = /^[A-Za-z0-9_-]+$/

/**
 * Keys that would reach an object's prototype if a path segment were ever used
 * to index one.
 */
const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * The value as an alert path.
 *
 * @throws {InvalidAlertPathError} when it is not one.
 */
export function validateAlertPath(value: unknown): Path {
  if (typeof value !== 'string' || value.length === 0) {
    throw new InvalidAlertPathError('the path must be a non-empty string')
  }
  if (value.length > MAX_PATH_LENGTH) {
    throw new InvalidAlertPathError(
      `the path must be at most ${String(MAX_PATH_LENGTH)} characters`
    )
  }

  const segments = value.split('.')
  for (const segment of segments) {
    if (!SEGMENT.test(segment)) {
      throw new InvalidAlertPathError(
        `"${segment}" is not a usable path segment`
      )
    }
    if (FORBIDDEN.has(segment)) {
      throw new InvalidAlertPathError(`"${segment}" is not allowed in a path`)
    }
  }

  return value as Path
}
