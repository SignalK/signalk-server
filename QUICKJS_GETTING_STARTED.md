# Getting Started with QuickJS WASM Plugins

This guide will help you install dependencies and test the new QuickJS plugin support.

## Prerequisites

- Node.js >= 20
- npm
- Signal K Server source code

## Installation

1. **Install Dependencies**

```bash
cd /path/to/signalk-server
npm install
```

This will install the `quickjs-emscripten` package required for QuickJS WASM support.

2. **Build the Server**

```bash
npm run build
```

This compiles the TypeScript code including the new QuickJS plugin loader.

## Testing with the Example Plugin

1. **Link the Example Plugin**

```bash
cd examples/quickjs-plugins/signalk-quickjs-hello-world
npm link
```

2. **Link to Signal K**

```bash
cd ../../..
npm link @signalk/quickjs-hello-world
```

3. **Start the Server**

```bash
npm start
```

4. **Enable the Plugin**

- Open the Signal K Admin UI (usually http://localhost:3000/@signalk/server-admin-ui)
- Navigate to Server → Plugin Config
- Find "QuickJS Hello World" in the plugin list
- Click "Enable"
- Configure the plugin settings if desired
- Click "Submit"

5. **Check the Logs**

You should see output like:

```
[signalk:quickjs-plugin-loader] Loading QuickJS plugin: _signalk_quickjs-hello-world from .../plugin.js
[signalk:quickjs-plugin-loader] Successfully loaded QuickJS plugin: QuickJS Hello World
[signalk:quickjs-plugin-loader] Starting QuickJS plugin: _signalk_quickjs-hello-world
[signalk:quickjs-plugin-loader] [_signalk_quickjs-hello-world] Plugin starting with config: {"message":"Hello from QuickJS!","interval":10}
[signalk:quickjs-plugin-loader] [_signalk_quickjs-hello-world] Hello from QuickJS!
[signalk:quickjs-plugin-loader] [_signalk_quickjs-hello-world] Emitted greeting delta
[signalk:quickjs-plugin-loader] Successfully started QuickJS plugin: _signalk_quickjs-hello-world
```

6. **Verify Data**

Check that the plugin emitted data:

```bash
# Use the Signal K REST API
curl http://localhost:3000/signalk/v1/api/vessels/self/environment/greeting
```

You should see:

```json
{
  "value": "Hello from QuickJS!",
  "timestamp": "2026-01-10T...",
  "$source": "quickjs-hello-world"
}
```

## Creating Your First Plugin

1. **Create Plugin Directory**

```bash
mkdir my-quickjs-plugin
cd my-quickjs-plugin
```

2. **Create package.json**

```json
{
  "name": "@signalk/my-quickjs-plugin",
  "version": "1.0.0",
  "description": "My first QuickJS plugin",
  "keywords": [
    "signalk-quickjs-plugin"
  ],
  "main": "plugin.js",
  "author": "Your Name",
  "license": "Apache-2.0"
}
```

**Important:** The `keywords` array MUST include `"signalk-quickjs-plugin"`.

3. **Create plugin.js**

```javascript
const plugin = {
  name: 'My First Plugin',
  id: '@signalk/my-quickjs-plugin',
  
  schema: {
    type: 'object',
    properties: {
      enabled: {
        type: 'boolean',
        title: 'Enable Plugin',
        default: true
      }
    }
  },
  
  start: function(configJson) {
    signalk.debug('My plugin is starting!')
    signalk.setStatus('Running')
    
    // Get vessel speed
    const speedJson = signalk.getSelfPath('navigation.speedOverGround')
    if (speedJson) {
      const speed = JSON.parse(speedJson)
      signalk.debug('Current speed: ' + speed.value + ' m/s')
    }
    
    return 0 // Success
  },
  
  stop: function() {
    signalk.debug('My plugin is stopping')
    signalk.setStatus('Stopped')
    return 0
  }
}
```

4. **Test Locally**

```bash
npm link
cd /path/to/signalk-server
npm link @signalk/my-quickjs-plugin
npm start
```

5. **Enable in Admin UI**

- Open Admin UI
- Go to Plugin Config
- Find your plugin
- Enable and configure it

## Common Issues

### Plugin Not Detected

**Symptom:** Plugin doesn't appear in Admin UI

**Solutions:**
- Verify `"signalk-quickjs-plugin"` is in package.json keywords
- Check that `npm link` completed successfully
- Restart the Signal K server
- Check server logs for loading errors

### Plugin Won't Start

**Symptom:** Plugin appears but fails to start

**Solutions:**
- Check JavaScript syntax in plugin.js
- Verify the `plugin` object is defined
- Check that `start()` returns 0
- Look for errors in server logs
- Enable debug logging for more details

### No Data Appearing

**Symptom:** Plugin starts but doesn't emit data

**Solutions:**
- Verify the Signal K path is correct
- Check that `emit()` is called with valid JSON
- Use `signalk.debug()` to log what's happening
- Check that data source exists before plugin starts

### Memory Errors

**Symptom:** Plugin crashes with memory errors

**Solutions:**
- Reduce memory usage in plugin
- Avoid large string concatenations
- Process data in smaller chunks
- Consider using a traditional plugin for heavy workloads

## Debugging

### Enable Debug Logging

In your Signal K configuration, enable debug logging:

```json
{
  "settings": {
    "enablePluginLogging": true
  }
}
```

Or set the DEBUG environment variable:

```bash
DEBUG=signalk:quickjs-plugin-loader npm start
```

### Add Debug Statements

Use `signalk.debug()` liberally in your plugin:

```javascript
start: function(configJson) {
  signalk.debug('Config received: ' + configJson)
  const config = JSON.parse(configJson)
  signalk.debug('Parsed config: ' + JSON.stringify(config))
  // ... rest of start logic
}
```

### Check Plugin Status

View plugin status in the Admin UI or via API:

```bash
curl http://localhost:3000/signalk/v1/api/plugins
```

## API Examples

### Reading Vessel Data

```javascript
// Position
const posJson = signalk.getSelfPath('navigation.position')
if (posJson) {
  const pos = JSON.parse(posJson)
  const lat = pos.value.latitude
  const lon = pos.value.longitude
}

// Speed
const speedJson = signalk.getSelfPath('navigation.speedOverGround')
if (speedJson) {
  const speed = JSON.parse(speedJson).value // m/s
}

// Heading
const headingJson = signalk.getSelfPath('navigation.headingTrue')
if (headingJson) {
  const heading = JSON.parse(headingJson).value // radians
}
```

### Emitting Deltas

```javascript
// Simple value
const delta = JSON.stringify({
  updates: [{
    source: { label: 'my-plugin' },
    timestamp: new Date().toISOString(),
    values: [{
      path: 'environment.myData',
      value: 42
    }]
  }]
})
signalk.emit(delta)

// Multiple values
const delta = JSON.stringify({
  updates: [{
    source: { label: 'my-plugin' },
    timestamp: new Date().toISOString(),
    values: [
      { path: 'navigation.custom.heading', value: 1.57 },
      { path: 'navigation.custom.speed', value: 5.5 }
    ]
  }]
})
signalk.emit(delta)
```

### Unit Conversions

```javascript
// Temperature: Kelvin to Celsius
const tempK = 293.15
const tempC = tempK - 273.15

// Temperature: Celsius to Fahrenheit
const tempF = tempC * 9/5 + 32

// Speed: m/s to knots
const speedMs = 5.0
const speedKts = speedMs * 1.94384

// Distance: meters to nautical miles
const distM = 1852
const distNM = distM / 1852
```

## Next Steps

- Read the [full documentation](docs/develop/plugins/quickjs-plugins.md)
- Study the [example plugin](examples/quickjs-plugins/signalk-quickjs-hello-world/)
- Join the [Signal K Slack](https://signalk-dev.slack.com) for help
- Share your plugins on npm with the `signalk-quickjs-plugin` keyword

## Resources

- [Signal K Documentation](https://signalk.org/documentation/)
- [Signal K Schema](https://signalk.org/specification/latest/doc/vesselsBranch.html)
- [JSON Schema](https://json-schema.org/)
- [QuickJS](https://bellard.org/quickjs/)

## Support

If you encounter issues:

1. Check the server logs
2. Review the documentation
3. Search GitHub issues
4. Ask on Signal K Slack
5. Open a GitHub issue with details

Happy plugin development! 🚀
