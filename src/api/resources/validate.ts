import { SignalKResourceType } from '@signalk/server-api'
import { buildSchemaSync } from '../validation/openapi-validator'
import { RESOURCES_API_PATH } from '.'
import { createDebug } from '../../debug'
import resourcesOpenApi from './openApi.json'
const debug = createDebug('signalk-server:api:resources:validate')

class ValidationError extends Error {}

const API_SCHEMA = buildSchemaSync(resourcesOpenApi)

export const validate = {
  resource: (
    type: SignalKResourceType,
    id: string | undefined,
    method: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value: any
  ): void => {
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
