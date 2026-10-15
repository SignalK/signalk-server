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

## Server-Sent Events

Handlers run synchronously and their response ends when they return, so a plugin cannot hold a connection open itself. Instead, a handler can hand the response to the server as a Server-Sent Events (SSE) stream on a named channel, and the plugin pushes events to that channel later, typically from `poll()` or `delta_handler()`. This suits live dashboards and hypermedia front ends such as [Datastar](https://data-star.dev/) that expect the server to push updates.

### Opening a stream

Return an envelope with an `sseChannel` field instead of `statusCode`:

```json
{
  "sseChannel": "panel",
  "body": "event: datastar-patch-elements\ndata: elements <div id=\"sog\">5.2 kn</div>\n\n"
}
```

- The server responds with `200` and `Content-Type: text/event-stream`, keeps the connection open and adds it to the plugin's `panel` channel.
- `body` is optional. It is written once, as raw event-stream text, to this client only. Use it to send the current state so a new client does not wait for the next update.
- `statusCode` and `headers` are ignored for stream responses.
- Channels belong to the plugin. Two plugins can use the same channel name without seeing each other's events.
- If the plugin is not running, the server answers `503` instead of opening a stream.

### Sending events

Import `sk_sse_send` from the `env` module:

| Function      | Parameters                                                             | Returns                                     |
| ------------- | ---------------------------------------------------------------------- | ------------------------------------------- |
| `sk_sse_send` | `(channel_ptr, channel_len, event_ptr, event_len, data_ptr, data_len)` | Number of clients reached, or `-1` on error |

All three strings are UTF-8. The server writes `event: <event>`, one `data:` line for each line of `data`, and a blank line to every client of the channel. An empty event name sends a default `message` event. An event name containing a line break is rejected with `-1`. A channel with no clients returns `0`.

AssemblyScript plugins can call `sseSend(channel, event, data)` from the SDK. In Rust, declare the import yourself:

```rust
#[link(wasm_import_module = "env")]
extern "C" {
    fn sk_sse_send(
        channel_ptr: *const u8, channel_len: usize,
        event_ptr: *const u8, event_len: usize,
        data_ptr: *const u8, data_len: usize,
    ) -> i32;
}

fn sse_send(channel: &str, event: &str, data: &str) -> i32 {
    unsafe {
        sk_sse_send(
            channel.as_ptr(), channel.len(),
            event.as_ptr(), event.len(),
            data.as_ptr(), data.len(),
        )
    }
}
```

### Connection handling

- The server sends a `: keep-alive` comment every 15 seconds so proxies do not close idle streams.
- Closed connections leave the channel automatically.
- A client that stops reading is disconnected once about 1 MB of events is queued for it.
- When the plugin stops, all of its streams are closed. Browser `EventSource` clients reconnect on their own and get `503` until the plugin runs again.
- Stream routes use the same authentication as the plugin's other endpoints.

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
