import { OpenApiDescription } from '../swagger'
import { getMergedCourseSpec } from './openApiMerger'

// Lazy load the merged spec to ensure TSOA spec file is available
let cachedMergedSpec: OpenApiDescription | null = null

/**
 * Course API OpenAPI specification with TSOA-generated and static endpoints merged
 * TSOA handles the GET endpoint with runtime validation
 * Static spec handles PUT/POST/DELETE operations
 */
export const courseApiRecord = {
  name: 'course',
  path: '/signalk/v2/api/vessels/self/navigation',
  get apiDoc(): OpenApiDescription {
    if (!cachedMergedSpec) {
      cachedMergedSpec = getMergedCourseSpec()
    }
    return cachedMergedSpec
  }
}
