/**
 * Weather Provider Plugin Example for Signal K
 *
 * Demonstrates:
 * - Weather Provider API integration (Signal K's official weather API)
 * - Provides observations, forecasts, and warnings via /signalk/v2/api/weather
 * - Fetches real weather data from OpenWeatherMap API
 *
 * This is different from the Resource Provider pattern - Weather Provider
 * integrates with Signal K's specialized weather API at:
 *   GET /signalk/v2/api/weather/observations?lat=...&lon=...
 *   GET /signalk/v2/api/weather/forecasts/daily?lat=...&lon=...
 *   GET /signalk/v2/api/weather/forecasts/point?lat=...&lon=...
 *   GET /signalk/v2/api/weather/warnings?lat=...&lon=...
 */

import {
  Plugin,
  emit,
  setStatus,
  setError,
  debug,
  createSimpleDelta
} from '@signalk/assemblyscript-plugin-sdk/assembly'

import {
  hasNetworkCapability
} from '@signalk/assemblyscript-plugin-sdk/assembly/network'

import { fetchSync } from 'as-fetch/sync'

// ===== Weather Provider FFI =====
// Declare the host-provided function for registering as a weather provider
@external("env", "sk_register_weather_provider")
declare function sk_register_weather_provider(namePtr: usize, nameLen: usize): i32

/**
 * Register this plugin as a weather provider
 * @param providerName - Display name for this provider (e.g., "OpenWeatherMap")
 * @returns true if registration succeeded
 */
function registerWeatherProvider(providerName: string): bool {
  const nameBytes = String.UTF8.encode(providerName)
  const result = sk_register_weather_provider(
    changetype<usize>(nameBytes),
    nameBytes.byteLength
  )
  return result === 1
}

// ===== Weather Data Types =====

/**
 * Weather observation/forecast data structure
 * Aligned with Signal K Weather API specification
 */
class WeatherData {
  date: string = ''
  type: string = 'observation' // 'observation' | 'daily' | 'point'
  description: string = ''

  // Outside conditions
  temperature: f64 = 0.0          // Kelvin
  minTemperature: f64 = 0.0       // Kelvin (for daily forecasts)
  maxTemperature: f64 = 0.0       // Kelvin (for daily forecasts)
  feelsLikeTemperature: f64 = 0.0 // Kelvin
  humidity: f64 = 0.0             // Ratio (0-1)
  pressure: f64 = 0.0             // Pascals
  dewPointTemperature: f64 = 0.0  // Kelvin
  cloudCover: f64 = 0.0           // Ratio (0-1)
  uvIndex: f64 = 0.0

  // Wind
  windSpeedTrue: f64 = 0.0        // m/s
  windDirectionTrue: f64 = 0.0    // Radians
  windGust: f64 = 0.0             // m/s

  // Precipitation
  precipitationVolume: f64 = 0.0  // mm

  toJSON(): string {
    let json = '{"date":"' + this.date + '"'
    json += ',"type":"' + this.type + '"'

    if (this.description.length > 0) {
      json += ',"description":"' + this.description + '"'
    }

    json += ',"outside":{'
    json += '"temperature":' + this.temperature.toString()

    if (this.type === 'daily') {
      json += ',"minTemperature":' + this.minTemperature.toString()
      json += ',"maxTemperature":' + this.maxTemperature.toString()
    }

    if (this.feelsLikeTemperature > 0) {
      json += ',"feelsLikeTemperature":' + this.feelsLikeTemperature.toString()
    }
    json += ',"relativeHumidity":' + this.humidity.toString()
    json += ',"pressure":' + this.pressure.toString()
    json += ',"cloudCover":' + this.cloudCover.toString()
    json += '}'

    json += ',"wind":{'
    json += '"speedTrue":' + this.windSpeedTrue.toString()
    json += ',"directionTrue":' + this.windDirectionTrue.toString()
    if (this.windGust > 0) {
      json += ',"gust":' + this.windGust.toString()
    }
    json += '}'

    json += '}'
    return json
  }
}

/**
 * Weather warning data structure
 */
class WeatherWarning {
  startTime: string = ''
  endTime: string = ''
  details: string = ''
  source: string = 'OpenWeatherMap'
  type: string = 'Warning'

  toJSON(): string {
    return '{"startTime":"' + this.startTime + '"' +
      ',"endTime":"' + this.endTime + '"' +
      ',"details":"' + this.details + '"' +
      ',"source":"' + this.source + '"' +
      ',"type":"' + this.type + '"}'
  }
}

// ===== Configuration =====

class WeatherConfig {
  apiKey: string = ''
  defaultLatitude: f64 = 60.1699  // Helsinki
  defaultLongitude: f64 = 24.9384
}

// ===== Global State =====

let config: WeatherConfig = new WeatherConfig()
let lastObservation: WeatherData | null = null

// ===== JSON Parsing Helpers =====

function extractNumber(json: string, key: string): f64 {
  const match = json.indexOf('"' + key + '":')
  if (match < 0) return 0.0

  const start = match + key.length + 3
  let end = start
  while (end < json.length &&
    (json.charCodeAt(end) >= 48 && json.charCodeAt(end) <= 57 ||
      json.charCodeAt(end) === 46 ||
      json.charCodeAt(end) === 45)) {
    end++
  }
  if (end > start) {
    return parseFloat(json.substring(start, end))
  }
  return 0.0
}

function extractString(json: string, key: string): string {
  const match = json.indexOf('"' + key + '":"')
  if (match < 0) return ''

  const start = match + key.length + 4
  const end = json.indexOf('"', start)
  if (end > start) {
    return json.substring(start, end)
  }
  return ''
}

// ===== Weather API Functions =====

function fetchCurrentWeather(lat: f64, lon: f64): WeatherData | null {
  const url = 'https://api.openweathermap.org/data/2.5/weather?lat=' +
    lat.toString() + '&lon=' + lon.toString() +
    '&appid=' + config.apiKey

  debug('Fetching current weather from: ' + url)

  const response = fetchSync(url)
  if (!response.ok) {
    debug('Weather fetch failed: HTTP ' + response.status.toString())
    return null
  }

  const json = response.text()
  debug('Weather response: ' + json.substring(0, 200))

  const data = new WeatherData()
  data.date = '' // Server will provide timestamp
  data.type = 'observation'

  // Parse main weather data
  data.temperature = extractNumber(json, 'temp')
  data.feelsLikeTemperature = extractNumber(json, 'feels_like')
  data.humidity = extractNumber(json, 'humidity') / 100.0
  data.pressure = extractNumber(json, 'pressure') * 100.0 // hPa to Pa

  // Parse wind
  data.windSpeedTrue = extractNumber(json, 'speed')
  const windDeg = extractNumber(json, 'deg')
  data.windDirectionTrue = windDeg * 3.14159265359 / 180.0

  // Parse clouds
  data.cloudCover = extractNumber(json, 'all') / 100.0

  // Parse description
  data.description = extractString(json, 'description')

  return data
}

function fetchForecast(lat: f64, lon: f64, forecastType: string): WeatherData[] {
  // OpenWeatherMap One Call API would be better for forecasts
  // For this example, we'll use the basic forecast API
  const url = 'https://api.openweathermap.org/data/2.5/forecast?lat=' +
    lat.toString() + '&lon=' + lon.toString() +
    '&appid=' + config.apiKey

  debug('Fetching forecast from: ' + url)

  const response = fetchSync(url)
  if (!response.ok) {
    debug('Forecast fetch failed: HTTP ' + response.status.toString())
    return []
  }

  const json = response.text()

  // Parse forecast list - simplified parsing
  // In production, use proper JSON parsing
  const forecasts: WeatherData[] = []

  // For this example, create mock forecast data based on current conditions
  // A real implementation would parse the OpenWeatherMap response
  const data = new WeatherData()
  data.date = '' // Server will provide timestamp
  data.type = forecastType
  data.temperature = extractNumber(json, 'temp')
  data.humidity = extractNumber(json, 'humidity') / 100.0
  data.pressure = extractNumber(json, 'pressure') * 100.0
  data.windSpeedTrue = extractNumber(json, 'speed')
  const windDeg = extractNumber(json, 'deg')
  data.windDirectionTrue = windDeg * 3.14159265359 / 180.0
  data.description = extractString(json, 'description')

  if (forecastType === 'daily') {
    data.minTemperature = data.temperature - 5.0
    data.maxTemperature = data.temperature + 5.0
  }

  forecasts.push(data)

  return forecasts
}

// ===== Plugin Class =====

class WeatherProviderPlugin extends Plugin {
  // Note: Plugin ID is derived from package.json name

  name(): string {
    return 'Weather Provider Plugin (Example)'
  }

  start(configJson: string): i32 {
    debug('Weather Provider plugin starting...')

    // Check network capability
    if (!hasNetworkCapability()) {
      setError('Network capability not granted')
      return 1
    }

    // Parse configuration
    if (configJson.length > 2) {
      // Extract API key
      const apiKeyMatch = configJson.indexOf('"apiKey"')
      if (apiKeyMatch >= 0) {
        const colonPos = configJson.indexOf(':', apiKeyMatch)
        const quoteStart = configJson.indexOf('"', colonPos)
        if (quoteStart >= 0) {
          const keyStart = quoteStart + 1
          const keyEnd = configJson.indexOf('"', keyStart)
          if (keyEnd > keyStart) {
            config.apiKey = configJson.substring(keyStart, keyEnd)
          }
        }
      }

      // Extract default latitude
      const latMatch = configJson.indexOf('"defaultLatitude"')
      if (latMatch >= 0) {
        config.defaultLatitude = extractNumber(configJson, 'defaultLatitude')
      }

      // Extract default longitude
      const lonMatch = configJson.indexOf('"defaultLongitude"')
      if (lonMatch >= 0) {
        config.defaultLongitude = extractNumber(configJson, 'defaultLongitude')
      }
    }

    // Validate configuration
    if (config.apiKey.length === 0) {
      setError('No API key configured - get one from https://openweathermap.org/api')
      return 1
    }

    // Register as a weather provider
    debug('Registering as weather provider...')
    if (registerWeatherProvider('OpenWeatherMap WASM')) {
      debug('Successfully registered as weather provider')
    } else {
      debug('Warning: Failed to register as weather provider')
      setError('Failed to register as weather provider - capability may not be granted')
      return 1
    }

    // Fetch initial weather data
    lastObservation = fetchCurrentWeather(config.defaultLatitude, config.defaultLongitude)
    if (lastObservation !== null) {
      // Also emit as deltas for real-time display
      const obs = lastObservation as WeatherData
      emit(createSimpleDelta('environment.outside.temperature', obs.temperature.toString()))
      emit(createSimpleDelta('environment.outside.humidity', obs.humidity.toString()))
      emit(createSimpleDelta('environment.outside.pressure', obs.pressure.toString()))
    }

    setStatus('Weather provider running - data from OpenWeatherMap')
    return 0
  }

  stop(): i32 {
    debug('Weather Provider plugin stopped')
    setStatus('Stopped')
    return 0
  }

  schema(): string {
    return `{
      "type": "object",
      "required": ["apiKey"],
      "properties": {
        "apiKey": {
          "type": "string",
          "title": "OpenWeatherMap API Key",
          "description": "Get your free API key from https://openweathermap.org/api"
        },
        "defaultLatitude": {
          "type": "number",
          "title": "Default Latitude",
          "description": "Default latitude when not specified in request",
          "default": 60.1699
        },
        "defaultLongitude": {
          "type": "number",
          "title": "Default Longitude",
          "description": "Default longitude when not specified in request",
          "default": 24.9384
        }
      }
    }`
  }
}

// ===== Plugin Instance & Exports =====

const plugin = new WeatherProviderPlugin()

// Note: plugin_id() is no longer required - ID is derived from package.json name

export function plugin_name(): string {
  return plugin.name()
}

export function plugin_schema(): string {
  return plugin.schema()
}

export function plugin_start(configPtr: usize, configLen: usize): i32 {
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

// ===== Weather Provider Handler Exports =====
// These are called by the Signal K server when requests come to /signalk/v2/api/weather

/**
 * Request structure for weather queries
 */
class WeatherRequest {
  latitude: f64 = 0.0
  longitude: f64 = 0.0
  type: string = ''
  maxCount: i32 = 10

  static parse(json: string): WeatherRequest {
    const req = new WeatherRequest()

    // Parse position
    const posMatch = json.indexOf('"position"')
    if (posMatch >= 0) {
      req.latitude = extractNumber(json, 'latitude')
      req.longitude = extractNumber(json, 'longitude')
    }

    // Parse type
    req.type = extractString(json, 'type')

    // Parse options
    const countMatch = json.indexOf('"maxCount"')
    if (countMatch >= 0) {
      req.maxCount = i32(extractNumber(json, 'maxCount'))
    }

    return req
  }
}

/**
 * Get weather observations for a location
 * Called for: GET /signalk/v2/api/weather/observations?lat=...&lon=...
 *
 * @param requestJson - JSON with { "position": { "latitude": ..., "longitude": ... }, "options": {...} }
 * @returns JSON array of observation data
 */
export function weather_get_observations(requestJson: string): string {
  debug('weather_get_observations called: ' + requestJson)

  const req = WeatherRequest.parse(requestJson)

  // Use provided position or default
  const lat = req.latitude !== 0.0 ? req.latitude : config.defaultLatitude
  const lon = req.longitude !== 0.0 ? req.longitude : config.defaultLongitude

  // Fetch current weather as observation
  const observation = fetchCurrentWeather(lat, lon)
  if (observation === null) {
    return '[]'
  }

  // Cache it
  lastObservation = observation

  // Return as array
  return '[' + observation.toJSON() + ']'
}

/**
 * Get weather forecasts for a location
 * Called for: GET /signalk/v2/api/weather/forecasts/daily?lat=...&lon=...
 *             GET /signalk/v2/api/weather/forecasts/point?lat=...&lon=...
 *
 * @param requestJson - JSON with position, type ('daily'|'point'), and options
 * @returns JSON array of forecast data
 */
export function weather_get_forecasts(requestJson: string): string {
  debug('weather_get_forecasts called: ' + requestJson)

  const req = WeatherRequest.parse(requestJson)

  // Use provided position or default
  const lat = req.latitude !== 0.0 ? req.latitude : config.defaultLatitude
  const lon = req.longitude !== 0.0 ? req.longitude : config.defaultLongitude

  // Determine forecast type
  const forecastType = req.type.length > 0 ? req.type : 'point'

  // Fetch forecasts
  const forecasts = fetchForecast(lat, lon, forecastType)

  if (forecasts.length === 0) {
    return '[]'
  }

  // Build JSON array
  let result = '['
  for (let i = 0; i < forecasts.length; i++) {
    if (i > 0) result += ','
    result += forecasts[i].toJSON()
  }
  result += ']'

  return result
}

/**
 * Get weather warnings for a location
 * Called for: GET /signalk/v2/api/weather/warnings?lat=...&lon=...
 *
 * @param requestJson - JSON with position
 * @returns JSON array of warning data
 */
export function weather_get_warnings(requestJson: string): string {
  debug('weather_get_warnings called: ' + requestJson)

  // OpenWeatherMap's free tier doesn't include weather alerts
  // Return empty array - real implementation would use One Call API
  // which requires a paid subscription for alerts

  return '[]'
}
