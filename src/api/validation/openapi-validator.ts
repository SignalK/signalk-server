/**
 * OpenAPI schema validator using AJV
 *
 * Replaces api-schema-builder to eliminate lodash.get deprecation warning.
 * Provides the same interface: schema[path][method].body.validate(value)
 */

import Ajv, { ValidateFunction, ErrorObject } from 'ajv'
import addFormats from 'ajv-formats'

interface EndpointValidator {
  body: {
    validate: (value: unknown) => boolean
    errors: ErrorObject[] | null | undefined
  }
  parameters: {
    validate: (params: { query?: unknown }) => boolean
    errors: ErrorObject[] | null | undefined
  }
}

interface OpenApiSchema {
  [path: string]: {
    [method: string]: EndpointValidator
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OpenApiSpec = any

/**
 * Build validators from an OpenAPI spec
 * Compatible with api-schema-builder's buildSchemaSync interface
 */
export function buildSchemaSync(openApiSpec: OpenApiSpec): OpenApiSchema {
  const ajv = new Ajv({
    allErrors: true,
    strict: false,
    validateFormats: true
  })
  addFormats(ajv)

  // Register the entire OpenAPI spec so AJV can resolve $refs internally
  // We use a custom URI scheme to avoid conflicts
  const specId = 'openapi://spec'

  // Add all component schemas with proper $id for $ref resolution
  // Transform refs inside component schemas too
  if (openApiSpec.components?.schemas) {
    for (const [name, schema] of Object.entries(
      openApiSpec.components.schemas
    )) {
      const transformedSchema = transformRefs(schema, specId)
      const schemaWithId = {
        ...(transformedSchema as object),
        $id: `${specId}/components/schemas/${name}`
      }
      try {
        ajv.addSchema(schemaWithId)
      } catch {
        // Schema might already be added, continue
      }
    }
  }

  const result: OpenApiSchema = {}

  if (!openApiSpec.paths) {
    return result
  }

  // Get server base URL if present
  const serverUrl = openApiSpec.servers?.[0]?.url || ''

  for (const [path, pathItem] of Object.entries(openApiSpec.paths)) {
    // Normalize OpenAPI path parameters {id} to Express format :id
    // and prepend the server URL
    const normalizedPath = (serverUrl + path).replace(/\{(\w+)\}/g, ':$1')
    result[normalizedPath] = {}

    for (const [method, operation] of Object.entries(
      pathItem as Record<string, unknown>
    )) {
      if (method === 'parameters') continue // Skip path-level parameters

      const op = operation as Record<string, unknown>

      // Create body validator
      let bodyValidator: ValidateFunction | null = null
      const requestBody = op.requestBody as Record<string, unknown> | undefined
      const content = requestBody?.content as
        | Record<string, unknown>
        | undefined
      const jsonContent = content?.['application/json'] as
        | Record<string, unknown>
        | undefined
      const bodySchema = jsonContent?.schema

      if (bodySchema) {
        try {
          // Transform $ref from OpenAPI format to our registered schemas
          const transformedSchema = transformRefs(bodySchema, specId)
          bodyValidator = ajv.compile(transformedSchema as object)
        } catch (e) {
          console.error(
            `Failed to compile body schema for ${method} ${path}:`,
            e
          )
          bodyValidator = null
        }
      }

      // Create parameters validator for query params
      let paramsValidator: ValidateFunction | null = null
      const parameters = op.parameters as
        | Array<Record<string, unknown>>
        | undefined
      const queryParams = parameters?.filter((p) => p.in === 'query') || []

      if (queryParams.length > 0) {
        const querySchema: Record<string, unknown> = {
          type: 'object',
          properties: {} as Record<string, unknown>,
          required: [] as string[]
        }

        for (const param of queryParams) {
          if (param.schema) {
            ;(querySchema.properties as Record<string, unknown>)[
              param.name as string
            ] = transformRefs(param.schema, specId)
          }
          if (param.required) {
            ;(querySchema.required as string[]).push(param.name as string)
          }
        }

        try {
          paramsValidator = ajv.compile({
            type: 'object',
            properties: {
              query: querySchema
            }
          })
        } catch {
          paramsValidator = null
        }
      }

      // Create endpoint validator with api-schema-builder compatible interface
      const endpoint: EndpointValidator = {
        body: {
          validate: (value: unknown): boolean => {
            if (!bodyValidator) return true
            const valid = bodyValidator(value)
            endpoint.body.errors = bodyValidator.errors
            return valid as boolean
          },
          errors: null
        },
        parameters: {
          validate: (params: { query?: unknown }): boolean => {
            if (!paramsValidator) return true
            const valid = paramsValidator(params)
            endpoint.parameters.errors = paramsValidator.errors
            return valid as boolean
          },
          errors: null
        }
      }

      result[normalizedPath][method] = endpoint
    }
  }

  return result
}

/**
 * Transform OpenAPI $refs to match our registered schema IDs
 */
function transformRefs(schema: unknown, specId: string): unknown {
  if (schema === null || typeof schema !== 'object') {
    return schema
  }

  if (Array.isArray(schema)) {
    return schema.map((item) => transformRefs(item, specId))
  }

  const obj = schema as Record<string, unknown>
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(obj)) {
    if (key === '$ref' && typeof value === 'string') {
      // Transform #/components/schemas/Name to openapi://spec/components/schemas/Name
      if (value.startsWith('#/components/schemas/')) {
        result[key] = `${specId}${value.substring(1)}`
      } else {
        result[key] = value
      }
    } else {
      result[key] = transformRefs(value, specId)
    }
  }

  return result
}
