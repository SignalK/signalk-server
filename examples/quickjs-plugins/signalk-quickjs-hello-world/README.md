# Signal K QuickJS Hello World Plugin

This is an example Signal K plugin that runs in a sandboxed QuickJS WASM environment.

## Features

- **Memory Isolation**: Runs in a separate WASM sandbox with memory limits
- **Controlled API Access**: Only accesses Signal K APIs through the provided `signalk` global object
- **Configuration UI**: Uses JSON Schema for configuration in the Admin UI
- **Pure JavaScript**: Written in standard JavaScript (no Node.js APIs)

## Installation

```bash
npm install @signalk/quickjs-hello-world
```

## Configuration

Configure the plugin through the Signal K Admin UI:

- **Message**: The message to log and emit as a delta
- **Interval**: How often (in seconds) to log the message

## Signal K API

The plugin has access to the following Signal K APIs through the `signalk` global object:

### Logging and Status

```javascript
signalk.debug(message)      // Log a debug message
signalk.setStatus(message)  // Set plugin status message
signalk.setError(message)   // Set plugin error message
```

### Data Access

```javascript
signalk.getSelfPath(path)   // Get data from vessel.self (returns JSON string)
signalk.getPath(path)       // Get data from any path (returns JSON string)
```

### Data Emission

```javascript
signalk.emit(deltaJson)     // Emit a Signal K delta (JSON string)
```

### Subscriptions

```javascript
signalk.subscribe(subscriptionJson)  // Subscribe to Signal K data
```

## Plugin Structure

A QuickJS plugin must define a `plugin` object with:

```javascript
const plugin = {
  name: 'Plugin Name',           // Display name
  id: '@scope/plugin-id',        // Package name
  schema: { /* JSON Schema */ }, // Configuration schema
  start: function(configJson) {  // Start function
    // Returns 0 for success, non-zero for error
  },
  stop: function() {             // Stop function
    // Returns 0 for success, non-zero for error
  }
}
```

## Limitations

QuickJS plugins run in a sandboxed environment and have the following limitations:

- No access to Node.js APIs (fs, http, etc.)
- No access to npm modules
- Limited memory (16MB default)
- No async/await or Promises (synchronous only)
- No setTimeout/setInterval
- No direct access to DOM or browser APIs

## Use Cases

QuickJS plugins are ideal for:

- Simple data transformations
- Custom calculations
- Data filtering and aggregation
- Lightweight integrations
- Secure third-party plugins
- Learning and experimentation

For more complex plugins requiring Node.js APIs, network access, or external dependencies, use traditional Signal K plugins.

## Development

To develop a QuickJS plugin:

1. Create a `package.json` with `"signalk-quickjs-plugin"` keyword
2. Create a `plugin.js` file with the plugin implementation
3. Test locally using the Signal K server
4. Publish to npm

## License

Apache-2.0
