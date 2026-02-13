import {
  SignalKResourceType,
  RouteSchema,
  WaypointSchema,
  RegionSchema,
  NoteSchema,
  ChartSchema
} from '@signalk/server-api'
import { Value } from '@sinclair/typebox/value'
import { type TSchema, Type } from '@sinclair/typebox'
import { createDebug } from '../../debug'
const debug = createDebug('signalk-server:api:resources:validate')

class ValidationError extends Error {}

// ---------------------------------------------------------------------------
// Map resource types to their TypeBox schemas
// ---------------------------------------------------------------------------

const resourceSchemas: Record<string, TSchema> = {
  routes: RouteSchema,
  waypoints: WaypointSchema,
  regions: RegionSchema,
  notes: NoteSchema,
  charts: ChartSchema
}

// ---------------------------------------------------------------------------
// Query parameter schema (shared across all resource list endpoints)
// ---------------------------------------------------------------------------

const QueryParamsSchema = Type.Object({
  provider: Type.Optional(Type.String()),
  limit: Type.Optional(Type.Number({ minimum: 1 })),
  distance: Type.Optional(Type.Number({ minimum: 100 })),
  bbox: Type.Optional(Type.Array(Type.Number(), { minItems: 4, maxItems: 4 })),
  position: Type.Optional(
    Type.Array(Type.Number(), { minItems: 2, maxItems: 2 })
  ),
  zoom: Type.Optional(Type.Number({ minimum: 1 }))
})

// ---------------------------------------------------------------------------
// Validation functions
// ---------------------------------------------------------------------------

export const validate = {
  resource: (
    type: SignalKResourceType,
    _id: string | undefined,
    _method: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value: any
  ): void => {
    debug(`Validating ${type} ${_method} ${JSON.stringify(value)}`)
    const schema = resourceSchemas[type]
    if (!schema) {
      throw new Error(`Validation: no schema for resource type ${type}`)
    }
    if (Value.Check(schema, value)) {
      return
    } else {
      const errors = [...Value.Errors(schema, value)]
      debug(errors)
      throw new ValidationError(JSON.stringify(errors))
    }
  },

  query: (
    type: SignalKResourceType,
    _id: string | undefined,
    _method: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value: any
  ): void => {
    debug(
      `*** Validating query params for ${type} ${_method} ${JSON.stringify(value)}`
    )
    if (Value.Check(QueryParamsSchema, value)) {
      return
    } else {
      const errors = [...Value.Errors(QueryParamsSchema, value)]
      debug(errors)
      throw new ValidationError(JSON.stringify(errors))
    }
  },

  // returns true if id is a valid Signal K UUID
  uuid: (id: string): boolean => {
    const uuid = RegExp(
      '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-4[0-9A-Fa-f]{3}-[89ABab][0-9A-Fa-f]{3}-[0-9A-Fa-f]{12}$'
    )
    return uuid.test(id)
  },

  // returns true if id is a valid Signal K Chart resource id
  chartId: (id: string): boolean => {
    const uuid = RegExp('(^[A-Za-z0-9_-]{8,}$)')
    return uuid.test(id)
  }
}
