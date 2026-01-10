# QuickJS WASM Plugins

Signal K Server supports running JavaScript plugins in a sandboxed QuickJS WASM environment. This provides a secure, isolated way to run plugins with controlled resource usage and limited access to system APIs.

## Overview

QuickJS plugins offer several advantages:

- **Security**: Plugins run in a WebAssembly sandbox with no direct system access
- **Resource Limits**: Memory and CPU usage can be controlled
- **Isolation**: Plugins cannot interfere with each other or the main server
- **Simplicity**: Pure JavaScript with no build tools or compilation required
- **Cross-platform**: WASM runs consistently across all platforms

## When to Use QuickJS Plugins

QuickJS plugins are ideal for:

- **Simple data transformations** and calculations
- **Filtering and aggregating** Signal K data
- **Custom notifications** based on vessel data
- **Learning and experimentation** with Signal K
- **Third-party plugins** where security is a concern
- **Lightweight integrations** that don't need external dependencies

## When NOT to Use QuickJS Plugins

Use traditional Node.js plugins instead when you need:

- Access to npm packages or external libraries
- File system access or network requests
- Async/await or Promise-based code
- Integration with hardware or system APIs
- Complex state management or databases
- High-performance computations

## Creating a QuickJS Plugin

### 1. Create Package Structure

```
my-plugin/
├── package.json
├── plugin.js
└── README.md
```

### 2. Configure package.json

```json
{
  "name": "@signalk/my-quickjs-plugin",
  "version": "1.0.0",
  "description": "My QuickJS plugin",
  "keywords": [
    "signalk-quickjs-plugin"
  ],
  "main": "plugin.js",
  "author": "Your Name",
  "license": "Apache-2.0"
}
```

**Important**: The `keywords` array must include `"signalk-quickjs-plugin"` for the plugin to be detected.

### 3. Implement plugin.js

```javascript
// Define the plugin object
const plugin = {
  name: 'My Plugin',
  id: '@signalk/my-quickjs-plugin',
  
  // JSON Schema for configuration
  schema: {
    type: 'object',
    properties: {
      enabled: {
        type: 'boolean',
        title: 'Enable Plugin',
        default: false
      },
      option1: {
        type: 'string',
        title: 'Some Option',
        default: 'value'
      }
    }
  },
  
  // Plugin lifecycle
  start: function(configJson) {
    try {
      const config = JSON.parse(configJson)
      signalk.debug('Plugin starting with config: ' + JSON.stringify(config))
      signalk.setStatus('Running')
      
      // Your plugin logic here
      
      return 0 // Success
    } catch (error) {
      signalk.setError('Failed to start: ' + error.toString())
      return 1 // Error
    }
  },
  
  stop: function() {
    signalk.debug('Plugin stopping')
    signalk.setStatus('Stopped')
    return 0
  }
}
```

## Signal K API Reference

QuickJS plugins have access to a limited Signal K API through the global `signalk` object:

### Logging Functions

```javascript
// Log debug messages (visible when debug logging enabled)
signalk.debug(message: string): void

// Set plugin status message (shown in Admin UI)
signalk.setStatus(message: string): void

// Set plugin error message (shown in Admin UI)
signalk.setError(message: string): void
```

### Data Access

```javascript
// Get data from vessel.self path
// Returns JSON string or null
signalk.getSelfPath(path: string): string | null

// Example:
const posJson = signalk.getSelfPath('navigation.position')
if (posJson) {
  const position = JSON.parse(posJson)
  const lat = position.value.latitude
  const lon = position.value.longitude
}

// Get data from any Signal K path
// Returns JSON string or null
signalk.getPath(path: string): string | null

// Example:
const sourcesJson = signalk.getPath('/sources')
```

### Data Emission

```javascript
// Emit a Signal K delta
// Takes a JSON string representing a delta object
signalk.emit(deltaJson: string): void

// Example:
const delta = JSON.stringify({
  updates: [{
    source: {
      label: 'my-plugin'
    },
    timestamp: new Date().toISOString(),
    values: [{
      path: 'navigation.myData',
      value: 42
    }]
  }]
})
signalk.emit(delta)
```

### Subscriptions

```javascript
// Subscribe to Signal K data (future feature)
signalk.subscribe(subscriptionJson: string): void
```

## Configuration Schema

Plugins use [JSON Schema](https://json-schema.org/) to define their configuration UI in the Admin UI.

### Example Schema

```javascript
schema: {
  type: 'object',
  required: ['interval'],
  properties: {
    interval: {
      type: 'number',
      title: 'Update Interval',
      description: 'How often to update (seconds)',
      default: 10,
      minimum: 1,
      maximum: 3600
    },
    threshold: {
      type: 'number',
      title: 'Threshold Value',
      default: 100
    },
    units: {
      type: 'string',
      title: 'Units',
      enum: ['meters', 'feet', 'nautical miles'],
      default: 'meters'
    },
    enabled: {
      type: 'boolean',
      title: 'Enable Notifications',
      default: true
    }
  }
}
```

## Limitations and Constraints

### Memory Limits

- Default limit: 16 MB per plugin
- Maximum stack size: 512 KB
- No dynamic memory allocation beyond limits

### No Async Operations

QuickJS in this implementation is synchronous only:
- No `async/await`
- No Promises
- No `setTimeout`/`setInterval`
- No callbacks

### No External APIs

Plugins cannot:
- Make network requests
- Access the file system
- Import npm packages
- Use Node.js APIs
- Access native modules

### Pure JavaScript Only

- ES5 compatible JavaScript
- No TypeScript (unless pre-compiled)
- No JSX or other extensions
- Limited standard library

## Examples

### Example 1: Simple Data Monitor

```javascript
const plugin = {
  name: 'Speed Monitor',
  schema: {
    type: 'object',
    properties: {
      maxSpeed: {
        type: 'number',
        title: 'Max Speed (knots)',
        default: 10
      }
    }
  },
  
  start: function(configJson) {
    const config = JSON.parse(configJson)
    const maxSpeed = config.maxSpeed || 10
    
    // Get current speed
    const speedJson = signalk.getSelfPath('navigation.speedOverGround')
    if (speedJson) {
      const speed = JSON.parse(speedJson)
      const speedKnots = speed.value * 1.94384 // m/s to knots
      
      if (speedKnots > maxSpeed) {
        signalk.debug('Speed exceeds limit: ' + speedKnots.toFixed(2) + ' knots')
      }
    }
    
    return 0
  },
  
  stop: function() {
    return 0
  }
}
```

### Example 2: Data Transformer

```javascript
const plugin = {
  name: 'Temperature Converter',
  schema: {
    type: 'object',
    properties: {
      outputUnit: {
        type: 'string',
        enum: ['celsius', 'fahrenheit'],
        default: 'fahrenheit'
      }
    }
  },
  
  start: function(configJson) {
    const config = JSON.parse(configJson)
    
    // Read temperature (in Kelvin)
    const tempJson = signalk.getSelfPath('environment.outside.temperature')
    if (tempJson) {
      const temp = JSON.parse(tempJson)
      const kelvin = temp.value
      
      // Convert based on configuration
      let converted
      if (config.outputUnit === 'celsius') {
        converted = kelvin - 273.15
      } else {
        converted = (kelvin - 273.15) * 9/5 + 32
      }
      
      // Emit converted temperature
      const delta = JSON.stringify({
        updates: [{
          source: { label: 'temp-converter' },
          timestamp: new Date().toISOString(),
          values: [{
            path: 'environment.outside.temperatureConverted',
            value: converted
          }]
        }]
      })
      signalk.emit(delta)
    }
    
    return 0
  },
  
  stop: function() {
    return 0
  }
}
```

## Testing and Debugging

### Enable Debug Logging

In the Admin UI, enable debug logging for your plugin to see `signalk.debug()` messages in the server logs.

### Common Issues

**Plugin not detected:**
- Check that `package.json` has `"signalk-quickjs-plugin"` in keywords
- Verify the plugin is installed in `node_modules`
- Check server logs for loading errors

**Plugin fails to start:**
- Check for JavaScript syntax errors
- Verify JSON is valid in `emit()` and `getSelfPath()` calls
- Check memory limits aren't exceeded

**No data received:**
- Verify the Signal K path exists and has data
- Check that data is published before plugin starts
- Use `signalk.debug()` to log received values

## Publishing Your Plugin

1. Test your plugin locally
2. Update version in `package.json`
3. Create a git repository
4. Publish to npm: `npm publish`
5. Users can install with: `npm install your-plugin-name`

## Performance Considerations

- QuickJS plugins have some overhead compared to native JavaScript
- Keep operations simple and avoid heavy computations
- Be mindful of memory usage
- Consider traditional plugins for performance-critical code

## Security Considerations

QuickJS plugins provide strong isolation but:
- Always validate configuration input
- Be careful with data from external sources
- Don't trust user-provided paths without validation
- Avoid emitting sensitive data in deltas

## Further Reading

- [QuickJS Documentation](https://bellard.org/quickjs/)
- [Signal K Plugin Development](../README.md)
- [Signal K Schema](https://signalk.org/specification/)
- [JSON Schema](https://json-schema.org/)
