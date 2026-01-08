/**
 * Routes & Waypoints Resource Provider Plugin Example
 *
 * Demonstrates:
 * - Resource Provider capability for standard Signal K resource types
 * - Routes: Navigation routes with GeoJSON LineString geometry
 * - Waypoints: Navigation points with GeoJSON Point geometry
 * - Full CRUD operations (list, get, set, delete)
 */

import {
  Plugin,
  setStatus,
  setError,
  debug
} from '@signalk/assemblyscript-plugin-sdk/assembly'

import {
  registerResourceProvider,
  ResourceGetRequest
} from '@signalk/assemblyscript-plugin-sdk/assembly/resources'

// ===== Data Types =====

/**
 * Waypoint data structure (GeoJSON Point)
 */
class Waypoint {
  id: string = ''
  name: string = ''
  description: string = ''
  type: string = 'Waypoint' // Waypoint, PoI, Race Mark, etc.
  longitude: f64 = 0.0
  latitude: f64 = 0.0

  toJSON(): string {
    return (
      '{' +
      '"name":"' +
      this.name +
      '",' +
      '"description":"' +
      this.description +
      '",' +
      '"type":"' +
      this.type +
      '",' +
      '"feature":{' +
      '"type":"Feature",' +
      '"geometry":{' +
      '"type":"Point",' +
      '"coordinates":[' +
      this.longitude.toString() +
      ',' +
      this.latitude.toString() +
      ']' +
      '},' +
      '"properties":{}' +
      '}' +
      '}'
    )
  }
}

/**
 * Route point metadata
 */
class RoutePoint {
  name: string = ''
  longitude: f64 = 0.0
  latitude: f64 = 0.0
}

/**
 * Route data structure (GeoJSON LineString)
 */
class Route {
  id: string = ''
  name: string = ''
  description: string = ''
  distance: f64 = 0.0
  points: RoutePoint[] = []

  toJSON(): string {
    let coords = ''
    let meta = ''
    for (let i = 0; i < this.points.length; i++) {
      if (i > 0) {
        coords += ','
        meta += ','
      }
      coords +=
        '[' +
        this.points[i].longitude.toString() +
        ',' +
        this.points[i].latitude.toString() +
        ']'
      meta += '{"name":"' + this.points[i].name + '"}'
    }

    return (
      '{' +
      '"name":"' +
      this.name +
      '",' +
      '"description":"' +
      this.description +
      '",' +
      '"distance":' +
      this.distance.toString() +
      ',' +
      '"feature":{' +
      '"type":"Feature",' +
      '"geometry":{' +
      '"type":"LineString",' +
      '"coordinates":[' +
      coords +
      ']' +
      '},' +
      '"properties":{' +
      '"coordinatesMeta":[' +
      meta +
      ']' +
      '}' +
      '}' +
      '}'
    )
  }
}

// ===== Storage =====

// Use arrays with linear search since AssemblyScript Map has limitations
const waypoints: Waypoint[] = []
const routes: Route[] = []

// Track which resource type we're currently handling
const currentResourceType: string = ''

// ===== Helper Functions =====

function findWaypointById(id: string): Waypoint | null {
  for (let i = 0; i < waypoints.length; i++) {
    if (waypoints[i].id === id) {
      return waypoints[i]
    }
  }
  return null
}

function findRouteById(id: string): Route | null {
  for (let i = 0; i < routes.length; i++) {
    if (routes[i].id === id) {
      return routes[i]
    }
  }
  return null
}

function deleteWaypointById(id: string): bool {
  for (let i = 0; i < waypoints.length; i++) {
    if (waypoints[i].id === id) {
      waypoints.splice(i, 1)
      return true
    }
  }
  return false
}

function deleteRouteById(id: string): bool {
  for (let i = 0; i < routes.length; i++) {
    if (routes[i].id === id) {
      routes.splice(i, 1)
      return true
    }
  }
  return false
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

function extractNumber(json: string, key: string): f64 {
  const match = json.indexOf('"' + key + '":')
  if (match < 0) return 0.0

  const start = match + key.length + 3
  let end = start
  while (
    end < json.length &&
    ((json.charCodeAt(end) >= 48 && json.charCodeAt(end) <= 57) ||
      json.charCodeAt(end) === 46 ||
      json.charCodeAt(end) === 45)
  ) {
    end++
  }
  if (end > start) {
    return parseFloat(json.substring(start, end))
  }
  return 0.0
}

// Simple UUID-like ID generator (not true UUID, but valid format)
let idCounter: i32 = 0
function generateId(): string {
  idCounter++
  const hex = idCounter.toString(16).padStart(8, '0')
  return hex + '-0000-4000-8000-000000000000'
}

// ===== Initialize Sample Data =====

function initializeSampleData(): void {
  // Sample Waypoints
  const wp1 = new Waypoint()
  wp1.id = 'a1b2c3d4-0001-4000-8000-000000000001'
  wp1.name = 'Helsinki Marina'
  wp1.description = 'Main marina in Helsinki harbor'
  wp1.type = 'Marina'
  wp1.longitude = 24.956
  wp1.latitude = 60.1695
  waypoints.push(wp1)

  const wp2 = new Waypoint()
  wp2.id = 'a1b2c3d4-0002-4000-8000-000000000002'
  wp2.name = 'Suomenlinna Anchorage'
  wp2.description = 'Protected anchorage near Suomenlinna fortress'
  wp2.type = 'Anchorage'
  wp2.longitude = 24.988
  wp2.latitude = 60.145
  waypoints.push(wp2)

  const wp3 = new Waypoint()
  wp3.id = 'a1b2c3d4-0003-4000-8000-000000000003'
  wp3.name = 'Fuel Dock'
  wp3.description = 'Diesel and petrol available'
  wp3.type = 'Fuel Station'
  wp3.longitude = 24.962
  wp3.latitude = 60.168
  waypoints.push(wp3)

  // Sample Route: Marina to Anchorage
  const route1 = new Route()
  route1.id = 'b2c3d4e5-0001-4000-8000-000000000001'
  route1.name = 'Marina to Suomenlinna'
  route1.description =
    'Short trip from Helsinki Marina to Suomenlinna anchorage'
  route1.distance = 3500.0 // meters

  const pt1 = new RoutePoint()
  pt1.name = 'Start - Marina'
  pt1.longitude = 24.956
  pt1.latitude = 60.1695
  route1.points.push(pt1)

  const pt2 = new RoutePoint()
  pt2.name = 'Channel marker'
  pt2.longitude = 24.97
  pt2.latitude = 60.16
  route1.points.push(pt2)

  const pt3 = new RoutePoint()
  pt3.name = 'End - Anchorage'
  pt3.longitude = 24.988
  pt3.latitude = 60.145
  route1.points.push(pt3)

  routes.push(route1)

  debug(
    'Initialized sample data: ' +
      waypoints.length.toString() +
      ' waypoints, ' +
      routes.length.toString() +
      ' routes'
  )
}

// ===== Plugin Class =====

class RoutesWaypointsPlugin extends Plugin {
  // Note: Plugin ID is derived from package.json name

  name(): string {
    return 'Routes & Waypoints Provider (Example)'
  }

  start(configJson: string): i32 {
    debug('Routes & Waypoints plugin starting...')

    // Initialize sample data
    initializeSampleData()

    // Register as resource provider for BOTH types
    debug('Registering as routes resource provider...')
    if (registerResourceProvider('routes')) {
      debug('Successfully registered for routes')
    } else {
      debug('Warning: Failed to register for routes')
    }

    debug('Registering as waypoints resource provider...')
    if (registerResourceProvider('waypoints')) {
      debug('Successfully registered for waypoints')
    } else {
      debug('Warning: Failed to register for waypoints')
    }

    setStatus(
      'Providing ' +
        waypoints.length.toString() +
        ' waypoints and ' +
        routes.length.toString() +
        ' routes'
    )
    return 0
  }

  stop(): i32 {
    debug('Routes & Waypoints plugin stopped')
    setStatus('Stopped')
    return 0
  }

  schema(): string {
    return `{
      "type": "object",
      "properties": {
        "info": {
          "type": "string",
          "title": "Information",
          "description": "This plugin provides sample routes and waypoints. No configuration needed.",
          "default": "Routes and waypoints are pre-populated with sample data from Helsinki area."
        }
      }
    }`
  }
}

// ===== Plugin Instance & Exports =====

const plugin = new RoutesWaypointsPlugin()

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

// ===== Resource Provider Handler Exports =====

/**
 * List resources
 * Called for: GET /signalk/v2/api/resources/routes
 *             GET /signalk/v2/api/resources/waypoints
 *
 * @param queryJson - JSON with query parameters and resourceType
 * @returns JSON object: { "id1": {...}, "id2": {...} }
 */
export function resources_list_resources(queryJson: string): string {
  debug('resources_list_resources called: ' + queryJson)

  // Extract resource type from query
  const resourceType = extractString(queryJson, 'resourceType')
  debug('Resource type: ' + resourceType)

  if (resourceType === 'waypoints') {
    let result = '{'
    for (let i = 0; i < waypoints.length; i++) {
      if (i > 0) result += ','
      result += '"' + waypoints[i].id + '":' + waypoints[i].toJSON()
    }
    result += '}'
    return result
  } else if (resourceType === 'routes') {
    let result = '{'
    for (let i = 0; i < routes.length; i++) {
      if (i > 0) result += ','
      result += '"' + routes[i].id + '":' + routes[i].toJSON()
    }
    result += '}'
    return result
  }

  // Unknown type - return empty
  return '{}'
}

/**
 * Get a specific resource
 * Called for: GET /signalk/v2/api/resources/routes/{id}
 *             GET /signalk/v2/api/resources/waypoints/{id}
 *
 * @param requestJson - JSON with { "id": "...", "resourceType": "..." }
 * @returns JSON object of the resource
 */
export function resources_get_resource(requestJson: string): string {
  debug('resources_get_resource called: ' + requestJson)

  const req = ResourceGetRequest.parse(requestJson)
  const resourceType = extractString(requestJson, 'resourceType')

  debug('Get ' + resourceType + ' id: ' + req.id)

  if (resourceType === 'waypoints') {
    const wp = findWaypointById(req.id)
    if (wp !== null) {
      return (wp as Waypoint).toJSON()
    }
    return '{"error":"Waypoint not found: ' + req.id + '"}'
  } else if (resourceType === 'routes') {
    const route = findRouteById(req.id)
    if (route !== null) {
      return (route as Route).toJSON()
    }
    return '{"error":"Route not found: ' + req.id + '"}'
  }

  return '{"error":"Unknown resource type"}'
}

/**
 * Create or update a resource
 * Called for: POST/PUT /signalk/v2/api/resources/routes/{id}
 *             POST/PUT /signalk/v2/api/resources/waypoints/{id}
 *
 * @param requestJson - JSON with { "id": "...", "resourceType": "...", "value": {...} }
 * @returns Empty string on success, error message on failure
 */
export function resources_set_resource(requestJson: string): string {
  debug('resources_set_resource called: ' + requestJson)

  const id = extractString(requestJson, 'id')
  const resourceType = extractString(requestJson, 'resourceType')

  debug('Set ' + resourceType + ' id: ' + id)

  if (resourceType === 'waypoints') {
    // Parse waypoint data from value
    const name = extractString(requestJson, 'name')
    const description = extractString(requestJson, 'description')
    const wpType = extractString(requestJson, 'type')

    // Try to extract coordinates from feature.geometry.coordinates
    // This is a simplified parser - production code would need full JSON parsing
    const coordsMatch = requestJson.indexOf('"coordinates":[')
    let lon: f64 = 0.0
    let lat: f64 = 0.0
    if (coordsMatch >= 0) {
      const coordsStart = coordsMatch + 15
      const coordsEnd = requestJson.indexOf(']', coordsStart)
      if (coordsEnd > coordsStart) {
        const coordsStr = requestJson.substring(coordsStart, coordsEnd)
        const commaPos = coordsStr.indexOf(',')
        if (commaPos > 0) {
          lon = parseFloat(coordsStr.substring(0, commaPos))
          lat = parseFloat(coordsStr.substring(commaPos + 1))
        }
      }
    }

    // Check if waypoint exists
    let wp = findWaypointById(id)
    if (wp === null) {
      // Create new waypoint
      wp = new Waypoint()
      wp.id = id.length > 0 ? id : generateId()
      waypoints.push(wp)
      debug('Created new waypoint: ' + wp.id)
    } else {
      debug('Updating existing waypoint: ' + wp.id)
    }

    // Update fields
    const w = wp as Waypoint
    if (name.length > 0) w.name = name
    if (description.length > 0) w.description = description
    if (wpType.length > 0) w.type = wpType
    if (lon !== 0.0) w.longitude = lon
    if (lat !== 0.0) w.latitude = lat

    setStatus(
      'Providing ' +
        waypoints.length.toString() +
        ' waypoints and ' +
        routes.length.toString() +
        ' routes'
    )
    return '' // Success
  } else if (resourceType === 'routes') {
    // Parse route data - simplified
    const name = extractString(requestJson, 'name')
    const description = extractString(requestJson, 'description')
    const distance = extractNumber(requestJson, 'distance')

    // Check if route exists
    let route = findRouteById(id)
    if (route === null) {
      // Create new route
      route = new Route()
      route.id = id.length > 0 ? id : generateId()
      routes.push(route)
      debug('Created new route: ' + route.id)
    } else {
      debug('Updating existing route: ' + route.id)
    }

    // Update fields
    const r = route as Route
    if (name.length > 0) r.name = name
    if (description.length > 0) r.description = description
    if (distance > 0) r.distance = distance

    // Note: Full route point parsing would require more complex JSON parsing
    // For this example, we just update metadata

    setStatus(
      'Providing ' +
        waypoints.length.toString() +
        ' waypoints and ' +
        routes.length.toString() +
        ' routes'
    )
    return '' // Success
  }

  return 'Unknown resource type'
}

/**
 * Delete a resource
 * Called for: DELETE /signalk/v2/api/resources/routes/{id}
 *             DELETE /signalk/v2/api/resources/waypoints/{id}
 *
 * @param requestJson - JSON with { "id": "...", "resourceType": "..." }
 * @returns Empty string on success, error message on failure
 */
export function resources_delete_resource(requestJson: string): string {
  debug('resources_delete_resource called: ' + requestJson)

  const id = extractString(requestJson, 'id')
  const resourceType = extractString(requestJson, 'resourceType')

  debug('Delete ' + resourceType + ' id: ' + id)

  if (resourceType === 'waypoints') {
    if (deleteWaypointById(id)) {
      debug('Deleted waypoint: ' + id)
      setStatus(
        'Providing ' +
          waypoints.length.toString() +
          ' waypoints and ' +
          routes.length.toString() +
          ' routes'
      )
      return '' // Success
    }
    return 'Waypoint not found: ' + id
  } else if (resourceType === 'routes') {
    if (deleteRouteById(id)) {
      debug('Deleted route: ' + id)
      setStatus(
        'Providing ' +
          waypoints.length.toString() +
          ' waypoints and ' +
          routes.length.toString() +
          ' routes'
      )
      return '' // Success
    }
    return 'Route not found: ' + id
  }

  return 'Unknown resource type'
}
