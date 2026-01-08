/**
 * Weather Plugin Example for Signal K
 *
 * Demonstrates:
 * - Network capability by fetching weather data from OpenWeatherMap API
 * - Resource provider capability for serving weather data via REST API
 * - Delta emission for real-time weather updates
 */

import {
  Plugin,
  emit,
  setStatus,
  setError,
  debug,
  createSimpleDelta
} from '@signalk/assemblyscript-plugin-sdk/assembly'

import { hasNetworkCapability } from '@signalk/assemblyscript-plugin-sdk/assembly/network'

import {
  registerResourceProvider,
  ResourceGetRequest
} from '@signalk/assemblyscript-plugin-sdk/assembly/resources'

import { fetchSync } from 'as-fetch/sync'
import { Response } from 'as-fetch/assembly'

// Configuration interface
class WeatherConfig {
  apiKey: string = ''
  latitude: f64 = 0.0
  longitude: f64 = 0.0
  updateInterval: i32 = 600000 // 10 minutes default
}

// Simple JSON parsing helpers
class WeatherData {
  temperature: f64 = 0.0
  humidity: f64 = 0.0
  pressure: f64 = 0.0
  windSpeed: f64 = 0.0
  windDirection: f64 = 0.0
  description: string = ''
  timestamp: string = ''
  latitude: f64 = 0.0
  longitude: f64 = 0.0

  toJSON(): string {
    return (
      '{"temperature":' +
      this.temperature.toString() +
      ',"humidity":' +
      this.humidity.toString() +
      ',"pressure":' +
      this.pressure.toString() +
      ',"windSpeed":' +
      this.windSpeed.toString() +
      ',"windDirection":' +
      this.windDirection.toString() +
      ',"timestamp":"' +
      this.timestamp +
      '"' +
      ',"location":{"latitude":' +
      this.latitude.toString() +
      ',"longitude":' +
      this.longitude.toString() +
      '}}'
    )
  }

  static parse(json: string): WeatherData | null {
    const data = new WeatherData()

    // Very basic JSON parsing - in production, use a proper JSON parser
    // This is just for demonstration purposes

    // Extract temperature: "temp":293.15
    const tempMatch = json.indexOf('"temp":')
    if (tempMatch >= 0) {
      const tempStart = tempMatch + 7
      let tempEnd = tempStart
      while (
        tempEnd < json.length &&
        ((json.charCodeAt(tempEnd) >= 48 && json.charCodeAt(tempEnd) <= 57) ||
          json.charCodeAt(tempEnd) === 46)
      ) {
        tempEnd++
      }
      const tempStr = json.substring(tempStart, tempEnd)
      data.temperature = parseFloat(tempStr) - 273.15 // Convert Kelvin to Celsius
    }

    // Extract humidity: "humidity":60
    const humMatch = json.indexOf('"humidity":')
    if (humMatch >= 0) {
      const humStart = humMatch + 11
      let humEnd = humStart
      while (
        humEnd < json.length &&
        json.charCodeAt(humEnd) >= 48 &&
        json.charCodeAt(humEnd) <= 57
      ) {
        humEnd++
      }
      const humStr = json.substring(humStart, humEnd)
      data.humidity = parseFloat(humStr)
    }

    // Extract pressure: "pressure":1013
    const pressMatch = json.indexOf('"pressure":')
    if (pressMatch >= 0) {
      const pressStart = pressMatch + 11
      let pressEnd = pressStart
      while (
        pressEnd < json.length &&
        json.charCodeAt(pressEnd) >= 48 &&
        json.charCodeAt(pressEnd) <= 57
      ) {
        pressEnd++
      }
      const pressStr = json.substring(pressStart, pressEnd)
      data.pressure = parseFloat(pressStr) * 100.0 // Convert hPa to Pa
    }

    // Extract wind speed: "speed":5.2
    const speedMatch = json.indexOf('"speed":')
    if (speedMatch >= 0) {
      const speedStart = speedMatch + 8
      let speedEnd = speedStart
      while (
        speedEnd < json.length &&
        ((json.charCodeAt(speedEnd) >= 48 && json.charCodeAt(speedEnd) <= 57) ||
          json.charCodeAt(speedEnd) === 46)
      ) {
        speedEnd++
      }
      const speedStr = json.substring(speedStart, speedEnd)
      data.windSpeed = parseFloat(speedStr)
    }

    // Extract wind direction: "deg":180
    const degMatch = json.indexOf('"deg":')
    if (degMatch >= 0) {
      const degStart = degMatch + 6
      let degEnd = degStart
      while (
        degEnd < json.length &&
        json.charCodeAt(degEnd) >= 48 &&
        json.charCodeAt(degEnd) <= 57
      ) {
        degEnd++
      }
      const degStr = json.substring(degStart, degEnd)
      // Convert degrees to radians
      data.windDirection = (parseFloat(degStr) * 3.14159265359) / 180.0
    }

    return data
  }
}

// Cached weather data for resource provider
let cachedWeatherData: WeatherData | null = null
let cachedConfig: WeatherConfig = new WeatherConfig()

// Weather plugin class
class WeatherPlugin extends Plugin {
  private config: WeatherConfig = new WeatherConfig()
  private lastUpdate: i64 = 0

  // Note: Plugin ID is derived from package.json name

  name(): string {
    return 'Weather Data Plugin (Example)'
  }

  start(configJson: string): i32 {
    debug('Weather plugin starting...')

    // Check if network capability is available
    if (!hasNetworkCapability()) {
      setError('Network capability not granted - cannot fetch weather data')
      return 1
    }

    // Parse configuration
    debug('Parsing config JSON')
    debug(configJson)
    if (configJson.length > 2) {
      // Very basic config parsing - extract apiKey, lat, lon
      // Fixed: indexOf searches FROM the given position, including that position
      // So we need to search from AFTER the colon
      const apiKeyMatch = configJson.indexOf('"apiKey"')
      debug('apiKeyMatch index:')
      debug(apiKeyMatch.toString())
      if (apiKeyMatch >= 0) {
        // Find the opening quote of the value (after the colon)
        const colonPos = configJson.indexOf(':', apiKeyMatch)
        const quoteStart = configJson.indexOf('"', colonPos)
        if (quoteStart >= 0) {
          const keyStart = quoteStart + 1 // Position after opening quote
          const keyEnd = configJson.indexOf('"', keyStart) // Find closing quote
          if (keyEnd > keyStart) {
            this.config.apiKey = configJson.substring(keyStart, keyEnd)
          }
        }
      }

      const latMatch = configJson.indexOf('"latitude"')
      if (latMatch >= 0) {
        const colonPos = configJson.indexOf(':', latMatch)
        let latStart = colonPos + 1
        let latEnd = latStart
        // Skip whitespace
        while (
          latEnd < configJson.length &&
          (configJson.charCodeAt(latEnd) === 32 ||
            configJson.charCodeAt(latEnd) === 9)
        ) {
          latEnd++
        }
        latStart = latEnd
        // Read number
        while (
          latEnd < configJson.length &&
          ((configJson.charCodeAt(latEnd) >= 48 &&
            configJson.charCodeAt(latEnd) <= 57) ||
            configJson.charCodeAt(latEnd) === 46 ||
            configJson.charCodeAt(latEnd) === 45)
        ) {
          latEnd++
        }
        if (latEnd > latStart) {
          this.config.latitude = parseFloat(
            configJson.substring(latStart, latEnd)
          )
        }
      }

      const lonMatch = configJson.indexOf('"longitude"')
      if (lonMatch >= 0) {
        const colonPos = configJson.indexOf(':', lonMatch)
        let lonStart = colonPos + 1
        let lonEnd = lonStart
        // Skip whitespace
        while (
          lonEnd < configJson.length &&
          (configJson.charCodeAt(lonEnd) === 32 ||
            configJson.charCodeAt(lonEnd) === 9)
        ) {
          lonEnd++
        }
        lonStart = lonEnd
        // Read number
        while (
          lonEnd < configJson.length &&
          ((configJson.charCodeAt(lonEnd) >= 48 &&
            configJson.charCodeAt(lonEnd) <= 57) ||
            configJson.charCodeAt(lonEnd) === 46 ||
            configJson.charCodeAt(lonEnd) === 45)
        ) {
          lonEnd++
        }
        if (lonEnd > lonStart) {
          this.config.longitude = parseFloat(
            configJson.substring(lonStart, lonEnd)
          )
        }
      }
    }

    // Validate configuration
    if (this.config.apiKey.length === 0) {
      setError(
        'No API key configured - get one from https://openweathermap.org/api'
      )
      return 1
    }

    // Store config globally for resource provider handlers
    cachedConfig = this.config

    // Register as a resource provider for "weather" type
    debug('Registering as weather resource provider...')
    if (registerResourceProvider('weather')) {
      debug('Successfully registered as weather resource provider')
    } else {
      debug(
        'Warning: Failed to register as resource provider (capability may not be granted)'
      )
    }

    // Fetch and emit real weather data using as-fetch
    // This demonstrates the Asyncify integration for synchronous-style async operations
    this.fetchWeatherData()
    setStatus('Weather plugin running - data fetched from OpenWeatherMap')

    return 0
  }

  stop(): i32 {
    debug('Weather plugin stopped')
    setStatus('Stopped')
    return 0
  }

  schema(): string {
    return `{
      "type": "object",
      "required": ["apiKey", "latitude", "longitude"],
      "properties": {
        "apiKey": {
          "type": "string",
          "title": "OpenWeatherMap API Key",
          "description": "Get your free API key from https://openweathermap.org/api"
        },
        "latitude": {
          "type": "number",
          "title": "Latitude",
          "description": "Latitude for weather location",
          "default": 60.1699
        },
        "longitude": {
          "type": "number",
          "title": "Longitude",
          "description": "Longitude for weather location",
          "default": 24.9384
        },
        "updateInterval": {
          "type": "number",
          "title": "Update Interval (ms)",
          "description": "How often to fetch weather data",
          "default": 600000
        }
      }
    }`
  }

  private emitTestWeatherData(): void {
    debug('Emitting test weather data...')

    // Emit test temperature (15°C)
    const tempDelta = createSimpleDelta(
      'environment.outside.temperature',
      '288.15' // 15°C in Kelvin
    )
    emit(tempDelta)

    // Emit test humidity (65%)
    const humDelta = createSimpleDelta(
      'environment.outside.humidity',
      '0.65'
    )
    emit(humDelta)

    // Emit test pressure (101300 Pa)
    const pressDelta = createSimpleDelta(
      'environment.outside.pressure',
      '101300'
    )
    emit(pressDelta)

    // Emit test wind speed (5.2 m/s)
    const windSpeedDelta = createSimpleDelta(
      'environment.wind.speedTrue',
      '5.2'
    )
    emit(windSpeedDelta)

    // Emit test wind direction (180° = 3.14159 radians)
    const windDirDelta = createSimpleDelta(
      'environment.wind.directionTrue',
      '3.14159'
    )
    emit(windDirDelta)

    debug('Test weather data emitted successfully')
  }

  private fetchWeatherData(): void {
    // Build API URL
    const lat = this.config.latitude.toString()
    const lon = this.config.longitude.toString()
    const url =
      'https://api.openweathermap.org/data/2.5/weather?lat=' +
      lat +
      '&lon=' +
      lon +
      '&appid=' +
      this.config.apiKey

    debug('Fetching weather data from: ' + url)

    // Fetch weather data using as-fetch synchronously
    const fetchResponse = fetchSync(url)

    if (!fetchResponse.ok) {
      setError(
        'Failed to fetch weather data - HTTP status: ' +
          fetchResponse.status.toString()
      )
      return
    }

    const response = fetchResponse.text()
    debug('Received weather response: ' + response.substring(0, 100) + '...')

    // Parse weather data
    const weatherData = WeatherData.parse(response)
    if (weatherData === null) {
      setError('Failed to parse weather data')
      return
    }

    // Add location for resource provider (timestamp will be set by server)
    weatherData.latitude = this.config.latitude
    weatherData.longitude = this.config.longitude

    // Cache the weather data for resource provider queries
    cachedWeatherData = weatherData

    // Emit temperature
    const tempDelta = createSimpleDelta(
      'environment.outside.temperature',
      weatherData.temperature.toString()
    )
    emit(tempDelta)

    // Emit humidity
    const humDelta = createSimpleDelta(
      'environment.outside.humidity',
      (weatherData.humidity / 100.0).toString()
    )
    emit(humDelta)

    // Emit pressure
    const pressDelta = createSimpleDelta(
      'environment.outside.pressure',
      weatherData.pressure.toString()
    )
    emit(pressDelta)

    // Emit wind speed
    const windSpeedDelta = createSimpleDelta(
      'environment.wind.speedTrue',
      weatherData.windSpeed.toString()
    )
    emit(windSpeedDelta)

    // Emit wind direction
    const windDirDelta = createSimpleDelta(
      'environment.wind.directionTrue',
      weatherData.windDirection.toString()
    )
    emit(windDirDelta)

    setStatus('Weather data updated')
    debug('Weather data emitted successfully')
  }
}

// Export plugin instance
const plugin = new WeatherPlugin()

// Plugin lifecycle exports
// Note: plugin_id() is no longer required - ID is derived from package.json name

export function plugin_name(): string {
  return plugin.name()
}

export function plugin_schema(): string {
  return plugin.schema()
}

export function plugin_start(configPtr: usize, configLen: usize): i32 {
  // Read config string from memory
  const len = i32(configLen)
  const configBytes = new Uint8Array(len)
  for (let i: i32 = 0; i < len; i++) {
    configBytes[i] = load<u8>(configPtr + <usize>i)
  }
  const configJson = String.UTF8.decode(configBytes.buffer)

  return plugin.start(configJson)
}

export function plugin_stop(): i32 {
  return plugin.stop()
}

// ===== Resource Provider Handlers =====
// These are called by the Signal K server when requests come in to
// /signalk/v2/api/resources/weather

/**
 * List available weather resources
 * Called for: GET /signalk/v2/api/resources/weather
 *
 * @param queryJson - JSON string with query parameters (e.g., filters)
 * @returns JSON object of resources: { "id": { ...resource... }, ... }
 */
export function resources_list_resources(queryJson: string): string {
  debug('resources_list_resources called with query: ' + queryJson)

  // Return available weather resources
  // We have one resource: "current" for current weather conditions
  if (cachedWeatherData !== null) {
    const data = cachedWeatherData as WeatherData
    return '{"current":' + data.toJSON() + '}'
  }

  // No data available yet
  return '{}'
}

/**
 * Get a specific weather resource
 * Called for: GET /signalk/v2/api/resources/weather/{id}
 *
 * @param requestJson - JSON with { "id": "resource-id", "property": optional }
 * @returns JSON object of the resource
 */
export function resources_get_resource(requestJson: string): string {
  debug('resources_get_resource called with request: ' + requestJson)

  // Parse the request to get the ID
  const req = ResourceGetRequest.parse(requestJson)
  debug('Parsed request id: ' + req.id)

  if (req.id === 'current') {
    if (cachedWeatherData !== null) {
      const data = cachedWeatherData as WeatherData
      return data.toJSON()
    }
    return '{"error":"No weather data available yet"}'
  }

  // Unknown resource ID
  return '{"error":"Resource not found: ' + req.id + '"}'
}
