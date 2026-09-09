/**
 * Bounds on what a caller may attach to an alert.
 *
 * An alert is held in memory, written to the database and republished to every
 * subscriber, so an unbounded field is an unbounded cost three times over. The
 * path is bounded in alertPath.ts; these are the rest.
 */

import type { Path, Value } from '@signalk/server-api'
import { InvalidAlertDescriptionError } from './errors'

export const MAX_MESSAGE_LENGTH = 1000

export const MAX_GROUP_LENGTH = 100

export const MAX_REFERENCES = 50

export const MAX_DATA_BYTES = 4096

/**
 * The descriptive fields, bounded.
 *
 * @throws {InvalidAlertDescriptionError} when one is too large.
 */
export function checkDescriptionBounds(description: {
  message: string
  group?: string
  references?: Path[]
  data?: Record<string, Value>
}): void {
  if (description.message.length > MAX_MESSAGE_LENGTH) {
    throw new InvalidAlertDescriptionError(
      `the message must be at most ${String(MAX_MESSAGE_LENGTH)} characters`
    )
  }
  if (description.group && description.group.length > MAX_GROUP_LENGTH) {
    throw new InvalidAlertDescriptionError(
      `the group must be at most ${String(MAX_GROUP_LENGTH)} characters`
    )
  }
  if (
    description.references &&
    description.references.length > MAX_REFERENCES
  ) {
    throw new InvalidAlertDescriptionError(
      `an alert may refer to at most ${String(MAX_REFERENCES)} paths`
    )
  }
  if (
    description.data &&
    Buffer.byteLength(JSON.stringify(description.data), 'utf8') > MAX_DATA_BYTES
  ) {
    throw new InvalidAlertDescriptionError(
      `the data must serialize to at most ${String(MAX_DATA_BYTES)} bytes`
    )
  }
}
