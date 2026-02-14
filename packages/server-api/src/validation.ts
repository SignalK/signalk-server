/**
 * Delta validation using TypeBox schemas.
 *
 * Provides a drop-in replacement for `@signalk/signalk-schema`'s
 * tv4-based `validateDelta()` using TypeBox's `Value.Check()`.
 */

import { Value } from '@sinclair/typebox/value'
import { DeltaSchema } from './protocol-schemas'

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

/**
 * Validate a delta message against the DeltaSchema.
 *
 * @param delta - The delta message to validate
 * @returns Validation result with `valid` boolean and `errors` array
 */
export function validateDelta(delta: unknown): ValidationResult {
  const valid = Value.Check(DeltaSchema, delta)
  if (valid) {
    return { valid: true, errors: [] }
  }
  const errors = [...Value.Errors(DeltaSchema, delta)].map(
    (e) => `${e.message} at ${e.path}`
  )
  return { valid: false, errors }
}
