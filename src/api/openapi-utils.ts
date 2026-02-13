/**
 * Shared OpenAPI Utilities
 *
 * Helpers for building OpenAPI documents from TypeBox schemas:
 * stripTypebox(), toOpenApiSchema(), standard response builders,
 * shared security schemes, and server version.
 */

import { type TSchema } from '@sinclair/typebox'
import { OkResponseSchema, ErrorResponseSchema } from '@signalk/server-api'

// eslint-disable-next-line @typescript-eslint/no-require-imports
export const serverVersion: string = require('../../' + 'package.json').version

/**
 * Recursively strip TypeBox internal metadata ($id, [Symbol.for('TypeBox.Kind')],
 * etc.) so nested schemas render fully expanded in Swagger UI instead of as
 * collapsed $id references.
 */
export function stripTypebox(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripTypebox)
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value)) {
      if (key === '$id') continue
      out[key] = stripTypebox((value as Record<string, unknown>)[key])
    }
    return out
  }
  return value
}

/**
 * Convert a TypeBox schema to an OpenAPI-compatible JSON Schema object.
 * Strips TypeBox metadata that confuses Swagger UI.
 */
export function toOpenApiSchema(schema: TSchema): Record<string, unknown> {
  return stripTypebox(schema) as Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Standard response definitions
// ---------------------------------------------------------------------------

/** Standard 200 OK response for mutations */
export const okResponse = {
  description: 'OK',
  content: {
    'application/json': {
      schema: toOpenApiSchema(OkResponseSchema)
    }
  }
}

/** Standard error response */
export const errorResponse = {
  description: 'Failed operation',
  content: {
    'application/json': {
      schema: toOpenApiSchema(ErrorResponseSchema)
    }
  }
}

// ---------------------------------------------------------------------------
// Security schemes (shared across all APIs)
// ---------------------------------------------------------------------------

/** Bearer JWT + Cookie auth security schemes */
export const securitySchemes = {
  bearerAuth: {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT'
  },
  cookieAuth: {
    type: 'apiKey',
    in: 'cookie',
    name: 'JAUTHENTICATION'
  }
}

/** Default security requirement (both cookie and bearer) */
export const defaultSecurity = [{ cookieAuth: [] }, { bearerAuth: [] }]

// ---------------------------------------------------------------------------
// Common OpenAPI document metadata
// ---------------------------------------------------------------------------

/** Standard Signal K external docs reference */
export const signalKExternalDocs = {
  url: 'http://signalk.org/specification/',
  description: 'Signal K specification.'
}

/** Standard Signal K license info */
export const signalKLicense = {
  name: 'Apache 2.0',
  url: 'http://www.apache.org/licenses/LICENSE-2.0.html'
}

/** Standard Signal K terms of service */
export const signalKTermsOfService = 'http://signalk.org/terms/'
