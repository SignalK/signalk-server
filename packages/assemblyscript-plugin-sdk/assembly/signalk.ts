/**
 * Signal K data model types for AssemblyScript
 */

/**
 * Position with latitude and longitude
 */
export class Position {
  latitude: f64
  longitude: f64

  constructor(latitude: f64, longitude: f64) {
    this.latitude = latitude
    this.longitude = longitude
  }

  toJSON(): string {
    return `{"latitude":${this.latitude},"longitude":${this.longitude}}`
  }
}

/**
 * Source information for delta updates
 */
export class Source {
  label: string
  type: string

  constructor(label: string, type: string = 'plugin') {
    this.label = label
    this.type = type
  }

  toJSON(): string {
    return `{"label":"${this.label}","type":"${this.type}"}`
  }
}

/**
 * Path-value pair for delta updates
 */
export class PathValue {
  path: string
  value: string // JSON-encoded value

  constructor(path: string, value: string) {
    this.path = path
    this.value = value
  }

  toJSON(): string {
    return `{"path":"${this.path}","value":${this.value}}`
  }
}

/**
 * Delta update containing source, timestamp, and values
 */
export class Update {
  source: Source
  timestamp: string
  values: PathValue[]

  constructor(source: Source, timestamp: string, values: PathValue[]) {
    this.source = source
    this.timestamp = timestamp
    this.values = values
  }

  toJSON(): string {
    let valuesJson = '['
    for (let i = 0; i < this.values.length; i++) {
      if (i > 0) valuesJson += ','
      valuesJson += this.values[i].toJSON()
    }
    valuesJson += ']'

    return `{"source":${this.source.toJSON()},"timestamp":"${this.timestamp}","values":${valuesJson}}`
  }
}

/**
 * Delta message with context and updates
 */
export class Delta {
  context: string
  updates: Update[]

  constructor(context: string, updates: Update[]) {
    this.context = context
    this.updates = updates
  }

  toJSON(): string {
    let updatesJson = '['
    for (let i = 0; i < this.updates.length; i++) {
      if (i > 0) updatesJson += ','
      updatesJson += this.updates[i].toJSON()
    }
    updatesJson += ']'

    return `{"context":"${this.context}","updates":${updatesJson}}`
  }
}

/**
 * Notification state
 */
export enum NotificationState {
  normal = 0,
  alert = 1,
  warn = 2,
  alarm = 3,
  emergency = 4
}

/**
 * Notification method
 */
export enum NotificationMethod {
  visual = 0,
  sound = 1
}

/**
 * Signal K notification
 */
export class Notification {
  state: NotificationState
  method: NotificationMethod[]
  message: string

  constructor(state: NotificationState, message: string) {
    this.state = state
    this.method = [NotificationMethod.visual]
    this.message = message
  }

  toJSON(): string {
    let methodStr = '['
    for (let i = 0; i < this.method.length; i++) {
      if (i > 0) methodStr += ','
      methodStr += this.method[i] == NotificationMethod.visual ? '"visual"' : '"sound"'
    }
    methodStr += ']'

    let stateStr = 'normal'
    if (this.state == NotificationState.alert) stateStr = 'alert'
    else if (this.state == NotificationState.warn) stateStr = 'warn'
    else if (this.state == NotificationState.alarm) stateStr = 'alarm'
    else if (this.state == NotificationState.emergency) stateStr = 'emergency'

    return `{"state":"${stateStr}","method":${methodStr},"message":"${this.message}"}`
  }
}

/**
 * Helper to get current ISO timestamp
 */
export function getCurrentTimestamp(): string {
  // In WASM environment, this would need to be provided by host
  // For now, return a placeholder (AssemblyScript doesn't have Date)
  return '2025-01-01T00:00:00.000Z'
}

/**
 * Helper to create a simple delta with single value
 */
export function createSimpleDelta(
  label: string,
  path: string,
  value: string
): Delta {
  const source = new Source(label, 'plugin')
  const timestamp = getCurrentTimestamp()
  const pathValue = new PathValue(path, value)
  const update = new Update(source, timestamp, [pathValue])
  return new Delta('vessels.self', [update])
}
