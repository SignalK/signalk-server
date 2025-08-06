import { OpenApiDescription } from '../swagger'
import courseStaticDoc from './openApi.json'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Merges TSOA-generated OpenAPI spec with static JSON spec
 *
 * This function combines:
 * - TSOA-generated GET endpoint with runtime validation and TypeScript types
 * - Static OpenAPI spec for POST/PUT/DELETE operations
 *
 * The merger ensures backward compatibility while enabling gradual migration
 * to TSOA for type-safe, validated endpoints.
 *
 * @returns {OpenApiDescription} Merged OpenAPI specification
 */
export function getMergedCourseSpec(): OpenApiDescription {
  // Read TSOA-generated spec if it exists
  const tsoaSpecPath = path.join(__dirname, '../generated/course-tsoa.json')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tsoaSpec: any = { paths: {}, components: {} }

  if (fs.existsSync(tsoaSpecPath)) {
    try {
      tsoaSpec = JSON.parse(fs.readFileSync(tsoaSpecPath, 'utf8'))
    } catch (error) {
      console.warn('Failed to read TSOA spec, using static only:', error)
    }
  }

  // Deep clone static spec as base
  const mergedSpec = JSON.parse(JSON.stringify(courseStaticDoc))

  // Replace GET endpoint with TSOA version if available
  const tsoaGetPath =
    tsoaSpec.paths?.['/vessels/self/navigation/course-tsoa']?.get
  if (tsoaGetPath) {
    // Ensure path exists in merged spec
    if (!mergedSpec.paths['/course']) {
      mergedSpec.paths['/course'] = {}
    }

    // Copy TSOA GET endpoint but adjust the path
    const adjustedGet = JSON.parse(JSON.stringify(tsoaGetPath))

    // Update operation ID to avoid conflicts
    if (adjustedGet.operationId) {
      adjustedGet.operationId = 'getCourseInfo'
    }

    // Replace GET with TSOA version, keep other methods from static
    mergedSpec.paths['/course'].get = adjustedGet
  }

  // Include parallel endpoint for gradual migration
  if (tsoaGetPath && tsoaSpec.paths?.['/vessels/self/navigation/course-tsoa']) {
    mergedSpec.paths['/course-tsoa'] = {
      get: tsoaGetPath
    }
  }

  // Merge component schemas
  if (tsoaSpec.components?.schemas) {
    mergedSpec.components = mergedSpec.components || {}
    mergedSpec.components.schemas = mergedSpec.components.schemas || {}

    // Add TSOA schemas (CourseInfo, etc.)
    Object.entries(tsoaSpec.components.schemas).forEach(([key, schema]) => {
      // Prefer TSOA schemas for types that are migrated
      if (key === 'CourseInfo' || key.startsWith('CourseInfo_')) {
        mergedSpec.components.schemas[key] = schema
      }
    })
  }

  // Ensure proper API metadata
  mergedSpec.info = mergedSpec.info || {}
  mergedSpec.info.title = 'Course API'
  mergedSpec.info.version = '2.0.0'
  mergedSpec.info.description =
    'Course and navigation management (Hybrid: TSOA + Static)'

  return mergedSpec as unknown as OpenApiDescription
}
