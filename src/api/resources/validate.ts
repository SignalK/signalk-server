import { SignalKResourceType } from '@signalk/server-api'
import { buildSchemaSync } from 'api-schema-builder'
import { RESOURCES_API_PATH } from '.'
import { createDebug } from '../../debug'
import { resourcesApiDoc } from './openApi'
const debug = createDebug('signalk-server:api:resources:validate')

export class ValidationError extends Error {}

// RFC 3339 with a UTC (Z) designator, per the logentries contract
const RFC3339_UTC_REGEX =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?Z$/

// Shape alone is not enough — the schema's date-time check is not
// calendar-strict — so verify the components form a real UTC instant.
const isRfc3339Utc = (value: string): boolean => {
  const match = RFC3339_UTC_REGEX.exec(value)
  if (!match) {
    return false
  }
  const date = new Date(value)
  return (
    !isNaN(date.getTime()) &&
    date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() + 1 === Number(match[2]) &&
    date.getUTCDate() === Number(match[3]) &&
    date.getUTCHours() === Number(match[4]) &&
    date.getUTCMinutes() === Number(match[5]) &&
    date.getUTCSeconds() === Number(match[6])
  )
}

const API_SCHEMA = buildSchemaSync(resourcesApiDoc)

export const validate = {
  resource: (
    type: SignalKResourceType,
    id: string | undefined,
    method: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value: any
  ): void => {
    debug.enabled &&
      debug(`Validating ${type} ${method} ${JSON.stringify(value)}`)
    const endpoint =
      API_SCHEMA[`${RESOURCES_API_PATH}/${type as string}${id ? '/:id' : ''}`][
        method.toLowerCase()
      ]
    if (!endpoint) {
      throw new Error(`Validation: endpoint for ${type} ${method} not found`)
    }
    const valid = endpoint.body.validate(value)
    if (valid) {
      validateLogEntry(type, id, value)
      return
    } else {
      debug(endpoint.body.errors)
      throw new ValidationError(JSON.stringify(endpoint.body.errors))
    }
  },

  query: (
    type: SignalKResourceType,
    id: string | undefined,
    method: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value: any
  ): void => {
    debug.enabled &&
      debug(
        `*** Validating query params for ${type} ${method} ${JSON.stringify(value)}`
      )
    const endpoint =
      API_SCHEMA[`${RESOURCES_API_PATH}/${type as string}${id ? '/:id' : ''}`][
        method.toLowerCase()
      ]
    if (!endpoint) {
      throw new Error(`Validation: endpoint for ${type} ${method} not found`)
    }
    const valid = endpoint.parameters.validate({ query: value })
    if (valid) {
      validateLogEntryListing(type, method, value)
      return
    } else {
      debug(endpoint.parameters.errors)
      throw new ValidationError(JSON.stringify(endpoint.parameters.errors))
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

/** Log entries: a payload `id`, if present, must equal the resource id (on
 * POST the resource id is server-generated, so a payload id can never match),
 * and `datetime`, if present, must be RFC 3339 UTC. */
const validateLogEntry = (
  type: SignalKResourceType,
  id: string | undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any
): void => {
  if (type !== 'logentries') {
    return
  }
  if (value.id !== undefined) {
    if (id === undefined || value.id !== id) {
      throw new ValidationError(
        `Log entry payload id (${value.id}) does not equal the resource id${id ? ` (${id})` : ''}`
      )
    }
  }
  if (value.datetime !== undefined && !isRfc3339Utc(value.datetime)) {
    throw new ValidationError(
      `Log entry datetime (${value.datetime}) is not an RFC 3339 UTC datetime`
    )
  }
}

/** Log entries are time-anchored: a listing must carry at least one of date,
 * from/to or limit, otherwise the response could not be distinguished from a
 * truncated one. `dates=true` alone is exempt — the day-calendar summary is
 * always complete. */
const validateLogEntryListing = (
  type: SignalKResourceType,
  method: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any
): void => {
  if (type !== 'logentries' || method !== 'GET') {
    return
  }
  const hasWindow =
    query.date !== undefined ||
    query.from !== undefined ||
    query.to !== undefined ||
    query.limit !== undefined
  if (!hasWindow && query.dates !== true) {
    throw new ValidationError(
      'Log entries listing requires one of the parameters date, from, to or limit — an unfiltered listing could be silently truncated. Use dates=true for a day-calendar summary.'
    )
  }
}
