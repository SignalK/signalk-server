---
title: HTTP Endpoints
---

# HTTP Endpoints

WASM plugins can register custom HTTP endpoints to provide REST APIs or serve dynamic content. This is useful for:

- Providing plugin-specific APIs
- Implementing webhook receivers
- Creating custom data queries
- Building interactive dashboards

## Registering HTTP Endpoints

Export an `http_endpoints()` function that returns a JSON array of endpoint definitions:

```typescript
// assembly/index.ts
export function http_endpoints(): string {
  return `[
    {
      "method": "GET",
      "path": "/api/data",
      "handler": "handle_get_data"
    },
    {
      "method": "POST",
      "path": "/api/update",
      "handler": "handle_post_update"
    }
  ]`
}
```

## Implementing HTTP Handlers

Handler functions receive a request context and return an HTTP response:

```typescript
export function handle_get_data(requestPtr: usize, requestLen: usize): string {
  // 1. Decode request from WASM memory
  const requestBytes = new Uint8Array(i32(requestLen))
  for (let i: i32 = 0; i < i32(requestLen); i++) {
    requestBytes[i] = load<u8>(requestPtr + <usize>i)
  }
  const requestJson = String.UTF8.decode(requestBytes.buffer)

  // 2. Parse request (contains method, path, query, params, body, headers)
  // Simple example: extract query parameter
  let filter = ''
  const filterIndex = requestJson.indexOf('"filter"')
  if (filterIndex >= 0) {
    // Extract the filter value from JSON
    // (In production, use proper JSON parsing)
  }

  // 3. Process request and build response data
  const data = {
    items: [
      { id: 1, value: 'Item 1' },
      { id: 2, value: 'Item 2' }
    ],
    count: 2
  }
  const bodyJson = JSON.stringify(data)

  // 4. Escape JSON for embedding in response string
  const escapedBody = bodyJson
    .replaceAll('"', '\\"')
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\r')

  // 5. Return HTTP response (status, headers, body)
  return `{
    "statusCode": 200,
    "headers": {"Content-Type": "application/json"},
    "body": "${escapedBody}"
  }`
}

export function handle_post_update(
  requestPtr: usize,
  requestLen: usize
): string {
  const requestBytes = new Uint8Array(i32(requestLen))
  for (let i: i32 = 0; i < i32(requestLen); i++) {
    requestBytes[i] = load<u8>(requestPtr + <usize>i)
  }
  const requestJson = String.UTF8.decode(requestBytes.buffer)

  // Process POST body and update state
  // ...

  return `{
    "statusCode": 200,
    "headers": {"Content-Type": "application/json"},
    "body": "{\\"success\\":true}"
  }`
}
```

## Request Context Format

The request context is a JSON object with:

```json
{
  "method": "GET",
  "path": "/api/logs",
  "query": {
    "lines": "100",
    "filter": "error"
  },
  "params": {},
  "body": null,
  "headers": {
    "user-agent": "Mozilla/5.0...",
    "accept": "application/json"
  }
}
```

## Response Format

Handler functions must return a JSON string with:

```json
{
  "statusCode": 200,
  "headers": {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache"
  },
  "body": "{\"data\": \"value\"}"
}
```

**Important Notes:**

- The `body` field must be a JSON-escaped string
- Use double escaping for quotes: `\\"` not `"`
- Endpoints are mounted at `/plugins/your-plugin-id/api/...`
- From browser, fetch from absolute path: `/plugins/your-plugin-id/api/logs`

## String Memory Management

The server uses the **AssemblyScript loader** for automatic string handling:

**For plugin metadata (id, name, schema, http_endpoints):**

- Return AssemblyScript strings directly
- Server automatically decodes with `__getString()`

**For HTTP handlers:**

- Receive: `(requestPtr: usize, requestLen: usize)` - raw memory pointer
- Manually decode UTF-8 bytes from WASM memory
- Return: AssemblyScript string with escaped JSON
- Server automatically decodes with `__getString()`

**Why manual decoding for handlers?**
The request is passed as raw UTF-8 bytes for efficiency, but the response is returned as an AssemblyScript string (UTF-16LE) which the loader decodes automatically.

## Testing Your Endpoints

```bash
# Test GET endpoint
curl http://localhost:3000/plugins/my-plugin/api/data?filter=test

# Test POST endpoint
curl -X POST http://localhost:3000/plugins/my-plugin/api/update \
  -H "Content-Type: application/json" \
  -d '{"value": 123}'
```

## Security Considerations

- Endpoints are sandboxed - no direct file system access
- Memory is isolated - cannot access other plugins
- Validate all input from requests
- Implement authentication if handling sensitive data
- Set appropriate CORS headers if needed
