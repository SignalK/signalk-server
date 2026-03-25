/**
 * Converts TypeBox schemas into an OpenAPI 3.0 `components.schemas` object.
 *
 * Each schema's `$id` becomes the key in the output map.  Bare `$ref`
 * values produced by TypeBox's `Type.Ref()` are rewritten to the
 * OpenAPI `#/components/schemas/<name>` form.  Embedded schemas that
 * have their own `$id` are replaced with a `$ref` link.  Non-standard
 * properties like `units` are stripped for OpenAPI 3.0 compliance.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type SchemaObject = Record<string, any>

/** Properties not part of OpenAPI 3.0 Schema Object spec */
const NON_STANDARD_PROPS = new Set(['units', 'additionalItems'])

function sanitize(obj: any): any {
  if (obj === null || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      obj[i] = sanitize(obj[i])
    }
    return obj
  }
  // Bare $ref from Type.Ref() → rewrite to OpenAPI path
  if (typeof obj.$ref === 'string' && !obj.$ref.startsWith('#')) {
    obj.$ref = `#/components/schemas/${obj.$ref}`
    return obj
  }
  // Embedded schema with $id → replace with a $ref
  if (typeof obj.$id === 'string') {
    return { $ref: `#/components/schemas/${obj.$id}` }
  }
  for (const key of Object.keys(obj)) {
    if (NON_STANDARD_PROPS.has(key)) {
      delete obj[key]
    } else if (key === 'examples' && Array.isArray(obj[key])) {
      // OpenAPI 3.0 uses singular 'example', not 'examples'
      obj.example = obj[key][0]
      delete obj[key]
    } else if (key === 'const') {
      // OpenAPI 3.0 doesn't support 'const'; use 'enum' with single value
      obj.enum = [obj[key]]
      delete obj[key]
    } else if (key === 'items' && Array.isArray(obj[key])) {
      // OpenAPI 3.0 doesn't support tuple validation (items as array).
      // Use first item schema as the single items schema.
      obj[key] = sanitize(obj[key][0])
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      obj[key] = sanitize(obj[key])
    }
  }
  return obj
}

export function typeboxToOpenApiSchemas(
  schemas: SchemaObject[]
): Record<string, SchemaObject> {
  const result: Record<string, SchemaObject> = {}
  for (const schema of schemas) {
    const id = schema.$id as string | undefined
    if (!id) {
      throw new Error(
        'TypeBox schema must have $id for OpenAPI component generation'
      )
    }
    const copy = structuredClone(schema)
    delete copy.$id
    sanitize(copy)
    result[id] = copy
  }
  return result
}
