# TSOA Migration Guide for SignalK Server

## Overview

This guide documents the pattern for migrating SignalK REST API endpoints from traditional Express handlers to TSOA controllers with TypeScript decorators, runtime validation, and automatic OpenAPI generation.

## Benefits of TSOA Migration

1. **Type Safety**: Full TypeScript support with compile-time type checking
2. **Runtime Validation**: Automatic request/response validation based on TypeScript types
3. **OpenAPI Generation**: Automatic OpenAPI/Swagger documentation from code
4. **Decorator-based Routing**: Clean, declarative API definitions
5. **Reduced Boilerplate**: Less manual validation and error handling code

## Migration Pattern

### Step 1: Create TSOA Controller

Create a new controller file with TSOA decorators:

```typescript
import { Controller, Get, Route, Tags, Security, Request } from 'tsoa'
import express from 'express'

@Route('vessels/self/navigation')
@Tags('Navigation')
export class CourseController extends Controller {
  @Get('course')
  @Security('signalK', ['read'])
  public async getCourseInfo(
    @Request() request: express.Request
  ): Promise<CourseInfo> {
    const app = request.app as any
    const api = app.courseApi
    return api.getCourseInfo()
  }
}
```

### Step 2: Configure TSOA

Update `tsoa.json` to include your controller:

```json
{
  "controllerPathGlobs": ["src/api/*/YourController.ts"],
  "spec": {
    "outputDirectory": "src/api/generated",
    "specFileBaseName": "your-api"
  }
}
```

### Step 3: Implement Parallel Endpoint (Recommended)

For safe migration, implement a parallel endpoint first:

```typescript
@Get('course-tsoa')  // Parallel endpoint for gradual migration
```

This allows:

- A/B testing in production
- Gradual client migration
- Easy rollback if issues arise

### Step 4: Merge OpenAPI Specifications

Create a merger to combine TSOA-generated and existing static specs:

```typescript
export function getMergedSpec(): OpenApiDescription {
  const tsoaSpec = // Read TSOA-generated spec
  const staticSpec = // Read existing static spec

  // Merge specs, preferring TSOA for migrated endpoints
  return mergedSpec
}
```

### Step 5: Authentication Integration

Ensure TSOA authentication works with SignalK's security:

```typescript
// src/api/tsoa-auth.ts
export async function expressAuthentication(
  request: express.Request,
  securityName: string,
  scopes?: string[]
): Promise<any> {
  if (securityName === 'signalK') {
    // Check SignalK authentication
    if (!request.skIsAuthenticated) {
      throw new Error('Authentication required')
    }
    return request.skPrincipal
  }
}
```

### Step 6: Testing

Create comprehensive tests for both endpoints:

```typescript
describe('TSOA Migration', () => {
  it('should return identical responses from both endpoints', async () => {
    const [originalData, tsoaData] = await Promise.all([
      fetch('/api/course'),
      fetch('/api/course-tsoa')
    ])
    expect(tsoaData).to.deep.equal(originalData)
  })
})
```

## Migration Checklist

- [ ] Create TSOA controller with TypeScript interfaces
- [ ] Add TSOA configuration to `tsoa.json`
- [ ] Update build scripts to include TSOA generation
- [ ] Implement authentication middleware
- [ ] Create parallel endpoint for testing
- [ ] Write comprehensive tests
- [ ] Update OpenAPI documentation
- [ ] Test in staging environment
- [ ] Monitor performance metrics
- [ ] Gradually migrate clients
- [ ] Remove old endpoint (after full migration)

## Common Patterns

### Accessing SignalK APIs

```typescript
const app = request.app as any
const api = app.yourApi // Access singleton API instances
```

### Error Handling

```typescript
if (!api) {
  this.setStatus(500)
  throw new Error('API not initialized')
}
```

### Response Status Codes

```typescript
@SuccessResponse(200, 'Success')
@Response(404, 'Not found')
@Response(500, 'Internal error')
```

## Best Practices

1. **Keep Controllers Thin**: Controllers should only handle HTTP concerns
2. **Reuse Existing Logic**: Call existing API methods rather than duplicating
3. **Document Everything**: Use JSDoc comments for better OpenAPI output
4. **Test Thoroughly**: Ensure identical behavior between old and new endpoints
5. **Monitor Migration**: Track usage of both endpoints during migration

## Troubleshooting

### Issue: Routes Not Found

- Ensure TSOA routes are registered after API initialization
- Check that controllers are included in `controllerPathGlobs`

### Issue: Authentication Failing

- Verify `expressAuthentication` properly checks SignalK auth
- Ensure security middleware is applied before TSOA routes

### Issue: Type Validation Errors

- Check that TypeScript interfaces match actual data
- Use optional properties (?) for nullable fields

## Example: Course API Migration

The Course API migration demonstrates the complete pattern:

1. **Controller**: `src/api/course/CourseController.ts`
2. **Types**: Defined `CourseInfo` interface
3. **Auth**: Integrated with SignalK security
4. **Tests**: Comprehensive parallel endpoint testing
5. **OpenAPI**: Merged TSOA and static specifications

## Next Steps

After successful migration of one endpoint:

1. Identify next endpoint for migration
2. Follow the same pattern
3. Share learnings with team
4. Update this guide with new insights

## Resources

- [TSOA Documentation](https://tsoa-community.github.io/docs/)
- [SignalK API Specification](http://signalk.org/specification/)
- [OpenAPI Specification](https://swagger.io/specification/)
