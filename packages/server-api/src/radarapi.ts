/**
 * Radar API Types
 *
 * Types and interfaces for the Signal K Radar API at
 * /signalk/v2/api/vessels/self/radars
 */

// ============================================================================
// Radar Status Types
// ============================================================================

/** @category Radar API */
export type RadarStatus = 'off' | 'standby' | 'transmit' | 'warming'

// ============================================================================
// Radar Control Types
// ============================================================================

/** @category Radar API */
export interface RadarControlValue {
  auto: boolean
  value: number
}

/** @category Radar API */
export interface RadarControls {
  gain: RadarControlValue
  sea?: RadarControlValue
  rain?: { value: number }
  interferenceRejection?: { value: number }
  targetExpansion?: { value: number }
  targetBoost?: { value: number }
  // Extensible for radar-specific controls
  [key: string]: RadarControlValue | { value: number } | undefined
}

/** @category Radar API */
export interface LegendEntry {
  color: string
  label: string
  minValue?: number
  maxValue?: number
}

// ============================================================================
// Capability and State Types
// ============================================================================

/**
 * Optional features a radar provider may support.
 *
 * These indicate what API features are implemented by the provider,
 * NOT hardware capabilities (those are in characteristics).
 *
 * @category Radar API
 */
export type SupportedFeature = 'arpa' | 'guardZones' | 'trails' | 'dualRange'

/**
 * Hardware characteristics of a radar.
 *
 * @category Radar API
 */
export interface RadarCharacteristics {
  /** Maximum detection range in meters */
  maxRange: number
  /** Minimum detection range in meters */
  minRange: number
  /** Supported discrete range values in meters */
  supportedRanges: number[]
  /** Number of spokes per full rotation */
  spokesPerRevolution: number
  /** Maximum spoke length in samples */
  maxSpokeLength: number
  /** Whether the radar supports Doppler/motion detection */
  hasDoppler: boolean
  /** Whether the radar supports dual-range mode */
  hasDualRange: boolean
  /** Maximum range for dual-range mode (if supported) */
  maxDualRange?: number
  /** Number of no-transmit zones supported */
  noTransmitZoneCount: number
}

/**
 * Control definition describing a radar control.
 *
 * @category Radar API
 */
export interface ControlDefinitionV5 {
  /** Semantic control ID (e.g., "gain", "beamSharpening") */
  id: string
  /** Human-readable name */
  name: string
  /** Description for tooltips */
  description: string
  /** Category: base controls all radars have, extended are model-specific */
  category: 'base' | 'extended'
  /** Control value type */
  type: 'boolean' | 'number' | 'enum' | 'compound'

  /** For type: "number" - value range constraints */
  range?: {
    min: number
    max: number
    step?: number
    unit?: string
  }

  /** For type: "enum" - allowed values */
  values?: Array<{
    value: string | number
    label: string
    description?: string
  }>

  /**
   * For type: "compound" - property definitions.
   * Structure varies by control type (radar-specific).
   */
  properties?: Record<string, unknown>

  /** Supported modes (auto/manual) */
  modes?: ('auto' | 'manual')[]
  /** Default mode */
  defaultMode?: 'auto' | 'manual'

  /** Whether this control is read-only */
  readOnly?: boolean
  /**
   * Default value for this control.
   * Type depends on the control type (boolean, number, enum value, or compound object).
   */
  default?: boolean | number | string | Record<string, unknown>
}

/**
 * Control constraint describing dependencies between controls.
 *
 * @category Radar API
 */
export interface ControlConstraint {
  /** Control ID this constraint applies to */
  controlId: string

  /** Condition that triggers the constraint */
  condition: {
    type: 'disabled_when' | 'read_only_when' | 'restricted_when'
    dependsOn: string
    operator: '==' | '!=' | '>' | '<' | '>=' | '<='
    value: string | number | boolean
  }

  /** Effect when condition is true */
  effect: {
    disabled?: boolean
    readOnly?: boolean
    /** Restricted set of allowed values when constraint is active */
    allowedValues?: (string | number | boolean)[]
    reason?: string
  }
}

/**
 * Capability manifest describing what a radar can do.
 * This is cacheable - capabilities rarely change at runtime.
 *
 * @category Radar API
 *
 * @example
 * ```json
 * {
 *   "id": "1",
 *   "make": "Furuno",
 *   "model": "DRS4D-NXT",
 *   "characteristics": {
 *     "maxRange": 88896,
 *     "minRange": 116,
 *     "supportedRanges": [116, 231, 463, ...],
 *     "hasDoppler": true
 *   },
 *   "controls": [
 *     {"id": "power", "type": "enum", ...},
 *     {"id": "gain", "type": "compound", ...}
 *   ]
 * }
 * ```
 */
export interface CapabilityManifest {
  /** Radar ID */
  id: string
  /** Manufacturer name */
  make: string
  /** Model name */
  model: string

  /** Model family (optional) */
  modelFamily?: string
  /** Serial number (optional) */
  serialNumber?: string
  /** Firmware version (optional) */
  firmwareVersion?: string

  /** Hardware characteristics */
  characteristics: RadarCharacteristics

  /** Available controls with their schemas */
  controls: ControlDefinitionV5[]

  /** Control dependencies/constraints */
  constraints?: ControlConstraint[]

  /**
   * Optional features this provider implements.
   *
   * Indicates which optional API features are available:
   * - 'arpa': ARPA target tracking (GET /targets, POST /targets, etc.)
   * - 'guardZones': Guard zone alerting (GET /guardZones, etc.)
   * - 'trails': Target trails/history (GET /trails)
   * - 'dualRange': Dual-range simultaneous display
   *
   * Note: This declares API capabilities, not hardware. A radar may have
   * hardware Doppler support (characteristics.hasDoppler) but the provider
   * might not implement the trails API endpoint.
   */
  supportedFeatures?: SupportedFeature[]
}

/**
 * Current radar state.
 * Contains status and all current control values.
 *
 * @category Radar API
 *
 * @example
 * ```json
 * {
 *   "id": "1",
 *   "timestamp": "2025-01-15T10:30:00Z",
 *   "status": "transmit",
 *   "controls": {
 *     "power": "transmit",
 *     "range": 5556,
 *     "gain": {"mode": "auto", "value": 65}
 *   }
 * }
 * ```
 */
export interface RadarState {
  /** Radar ID */
  id: string
  /** ISO 8601 timestamp of when state was captured */
  timestamp: string
  /** Current operational status */
  status: RadarStatus

  /**
   * Current control values keyed by control ID.
   * Value types depend on the control type defined in CapabilityManifest.
   */
  controls: Record<string, unknown>

  /** Controls that are currently disabled and why */
  disabledControls?: Array<{
    controlId: string
    reason: string
  }>
}

// ============================================================================
// ARPA Target Types
// ============================================================================

/**
 * ARPA target status.
 *
 * @category Radar API
 */
export type ArpaTargetStatus = 'tracking' | 'lost' | 'acquiring'

/**
 * ARPA target acquisition method.
 *
 * @category Radar API
 */
export type ArpaAcquisitionMethod = 'manual' | 'auto'

/**
 * ARPA target position data.
 *
 * @category Radar API
 */
export interface ArpaTargetPosition {
  /** Bearing from own ship in degrees (0-360, true north) */
  bearing: number
  /** Distance from own ship in meters */
  distance: number
  /** Latitude (if GPS available) */
  latitude?: number
  /** Longitude (if GPS available) */
  longitude?: number
}

/**
 * ARPA target motion data.
 *
 * @category Radar API
 */
export interface ArpaTargetMotion {
  /** Course over ground in degrees (0-360, true north) */
  course: number
  /** Speed over ground in meters per second */
  speed: number
}

/**
 * ARPA target danger assessment.
 *
 * @category Radar API
 */
export interface ArpaTargetDanger {
  /** Closest Point of Approach in meters */
  cpa: number
  /** Time to CPA in seconds (negative if target is receding) */
  tcpa: number
}

/**
 * ARPA tracked target.
 *
 * @category Radar API
 *
 * @example
 * ```json
 * {
 *   "id": 1,
 *   "status": "tracking",
 *   "position": {
 *     "bearing": 45.2,
 *     "distance": 1852,
 *     "latitude": 52.1234,
 *     "longitude": 4.5678
 *   },
 *   "motion": {
 *     "course": 180.5,
 *     "speed": 5.14
 *   },
 *   "danger": {
 *     "cpa": 150,
 *     "tcpa": 300
 *   },
 *   "acquisition": "manual",
 *   "firstSeen": "2025-01-15T10:28:00Z",
 *   "lastSeen": "2025-01-15T10:30:00Z"
 * }
 * ```
 */
export interface ArpaTarget {
  /** Unique target identifier (1-99 typically) */
  id: number
  /** Current tracking status */
  status: ArpaTargetStatus
  /** Target position relative to own ship */
  position: ArpaTargetPosition
  /** Target motion (course and speed) */
  motion: ArpaTargetMotion
  /** Danger assessment (CPA/TCPA) */
  danger: ArpaTargetDanger
  /** How this target was acquired */
  acquisition: ArpaAcquisitionMethod
  /** ISO 8601 timestamp when target was first acquired */
  firstSeen: string
  /** ISO 8601 timestamp of most recent radar return */
  lastSeen: string
}

/**
 * Response from GET /radars/{id}/targets.
 *
 * @category Radar API
 *
 * @example
 * ```json
 * {
 *   "radarId": "radar-0",
 *   "timestamp": "2025-01-15T10:30:00Z",
 *   "targets": [
 *     { "id": 1, "status": "tracking", ... },
 *     { "id": 2, "status": "lost", ... }
 *   ]
 * }
 * ```
 */
export interface TargetListResponse {
  /** Radar ID */
  radarId: string
  /** ISO 8601 timestamp */
  timestamp: string
  /** List of tracked targets */
  targets: ArpaTarget[]
}

/**
 * WebSocket message for target streaming.
 *
 * @category Radar API
 */
export interface TargetStreamMessage {
  /** Message type */
  type: 'target_update' | 'target_lost' | 'target_acquired'
  /** ISO 8601 timestamp */
  timestamp: string
  /** Updated/lost/acquired target */
  target: ArpaTarget
}

/**
 * ARPA settings for a radar.
 *
 * @category Radar API
 */
export interface ArpaSettings {
  /** Whether ARPA is enabled */
  enabled: boolean
  /** Maximum number of targets to track (typically 10-100) */
  maxTargets: number
  /** CPA threshold for danger alert in meters */
  cpaThreshold: number
  /** TCPA threshold for danger alert in seconds */
  tcpaThreshold: number
  /** Seconds before marking a target as lost */
  lostTargetTimeout: number
  /** Auto-acquisition sensitivity (0=off, 1-3=low/med/high) */
  autoAcquisition: number
}

// ============================================================================
// Radar Info (Response Object)
// ============================================================================

/**
 * Radar information returned by GET /radars/{id}
 *
 * @category Radar API
 *
 * @example
 * ```json
 * {
 *   "id": "radar-0",
 *   "name": "Furuno DRS4D-NXT",
 *   "brand": "Furuno",
 *   "status": "transmit",
 *   "spokesPerRevolution": 2048,
 *   "maxSpokeLen": 1024,
 *   "range": 2000,
 *   "controls": {
 *     "gain": { "auto": false, "value": 50 },
 *     "sea": { "auto": true, "value": 30 }
 *   },
 *   "streamUrl": "ws://192.168.1.100:3001/v1/api/stream/radar-0"
 * }
 * ```
 */
export interface RadarInfo {
  /** Unique identifier for this radar */
  id: string
  /** Display name */
  name: string
  /** Radar brand/manufacturer */
  brand?: string
  /** Current operational status */
  status: RadarStatus
  /** Number of spokes per full rotation */
  spokesPerRevolution: number
  /** Maximum spoke length in samples */
  maxSpokeLen: number
  /** Current range in meters */
  range: number
  /** Current control settings */
  controls: RadarControls
  /** Color legend for radar display */
  legend?: LegendEntry[]
  /**
   * WebSocket URL for radar spoke streaming.
   *
   * - If **absent**: Clients use the built-in stream endpoint:
   *   `ws://server/signalk/v2/api/vessels/self/radars/{id}/stream`
   *   or `ws://server/signalk/v2/api/streams/radars/{id}`
   *   (WASM plugins emit spokes via `sk_radar_emit_spokes()` FFI binding)
   *
   * - If **present**: Clients connect directly to external URL (backward compat)
   *   @example "ws://192.168.1.100:3001/stream" (external mayara-server)
   */
  streamUrl?: string
}

// ============================================================================
// Radar Provider Interface (for plugins)
// ============================================================================

/**
 * Provider interface for plugins that provide radar data.
 *
 * @category Radar API
 *
 * @example
 * ```javascript
 * app.registerRadarProvider({
 *   name: 'Furuno Radar Plugin',
 *   methods: {
 *     getRadars: async () => ['radar-0'],
 *     getRadarInfo: async (id) => ({
 *       id: 'radar-0',
 *       name: 'Furuno DRS4D-NXT',
 *       status: 'transmit',
 *       spokesPerRevolution: 2048,
 *       maxSpokeLen: 1024,
 *       range: 2000,
 *       controls: { gain: { auto: false, value: 50 } },
 *       streamUrl: 'ws://192.168.1.100:3001/stream'
 *     }),
 *     setPower: async (id, state) => { ... },
 *     setRange: async (id, range) => { ... },
 *     setGain: async (id, gain) => { ... }
 *   }
 * })
 * ```
 */
export interface RadarProvider {
  /** Display name for this radar provider */
  name: string
  /** Provider methods */
  methods: RadarProviderMethods
}

/** @category Radar API */
export interface RadarProviderMethods {
  /** Plugin ID (set automatically on registration) */
  pluginId?: string

  /**
   * Get list of radar IDs this provider manages.
   * @returns Array of radar IDs
   */
  getRadars: () => Promise<string[]>

  /**
   * Get detailed info for a specific radar.
   * @param radarId The radar ID
   * @returns Radar info or null if not found
   */
  getRadarInfo: (radarId: string) => Promise<RadarInfo | null>

  /**
   * Set radar power state.
   * @param radarId The radar ID
   * @param state Target power state
   * @returns true on success
   */
  setPower?: (radarId: string, state: RadarStatus) => Promise<boolean>

  /**
   * Set radar range in meters.
   * @param radarId The radar ID
   * @param range Range in meters
   * @returns true on success
   */
  setRange?: (radarId: string, range: number) => Promise<boolean>

  /**
   * Set radar gain.
   * @param radarId The radar ID
   * @param gain Gain settings
   * @returns true on success
   */
  setGain?: (
    radarId: string,
    gain: { auto: boolean; value?: number }
  ) => Promise<boolean>

  /**
   * Set radar sea clutter.
   * @param radarId The radar ID
   * @param sea Sea clutter settings
   * @returns true on success
   */
  setSea?: (
    radarId: string,
    sea: { auto: boolean; value?: number }
  ) => Promise<boolean>

  /**
   * Set radar rain clutter.
   * @param radarId The radar ID
   * @param rain Rain clutter settings
   * @returns true on success
   */
  setRain?: (
    radarId: string,
    rain: { auto: boolean; value?: number }
  ) => Promise<boolean>

  /**
   * Set multiple radar controls at once.
   * @param radarId The radar ID
   * @param controls Partial controls to update
   * @returns true on success
   */
  setControls?: (
    radarId: string,
    controls: Partial<RadarControls>
  ) => Promise<boolean>

  /**
   * Handle WebSocket stream connection (optional).
   * Only needed if provider doesn't expose external streamUrl.
   * @param radarId The radar ID
   * @param ws WebSocket connection to send spoke data to
   */
  handleStreamConnection?: (radarId: string, ws: WebSocket) => void

  // ============================================
  // Capability and State Methods
  // ============================================

  /**
   * Get capability manifest for a radar.
   * Returns detailed capabilities including supported controls, ranges, features.
   * @param radarId The radar ID
   * @returns CapabilityManifest or null if not found
   */
  getCapabilities?: (radarId: string) => Promise<CapabilityManifest | null>

  /**
   * Get current radar state.
   * Returns status and all current control values.
   * @param radarId The radar ID
   * @returns RadarState or null if not found
   */
  getState?: (radarId: string) => Promise<RadarState | null>

  /**
   * Get a single control value.
   * @param radarId The radar ID
   * @param controlId The semantic control ID (e.g., "gain", "beamSharpening")
   * @returns Control value or null if not found. Type depends on control definition.
   */
  getControl?: (radarId: string, controlId: string) => Promise<unknown>

  /**
   * Set a single control value.
   * @param radarId The radar ID
   * @param controlId The semantic control ID (e.g., "gain", "beamSharpening")
   * @param value The value to set. Type depends on control definition.
   * @returns Result with success flag and optional error
   */
  setControl?: (
    radarId: string,
    controlId: string,
    value: unknown
  ) => Promise<{ success: boolean; error?: string }>

  // ============================================
  // ARPA Target Methods
  // ============================================

  /**
   * Get all tracked ARPA targets.
   * @param radarId The radar ID
   * @returns Target list response or null if not supported
   */
  getTargets?: (radarId: string) => Promise<TargetListResponse | null>

  /**
   * Manually acquire a target at the specified position.
   * @param radarId The radar ID
   * @param bearing Bearing in degrees (0-360, true north)
   * @param distance Distance in meters
   * @returns Result with success flag and optional target ID
   */
  acquireTarget?: (
    radarId: string,
    bearing: number,
    distance: number
  ) => Promise<{ success: boolean; targetId?: number; error?: string }>

  /**
   * Cancel tracking of a target.
   * @param radarId The radar ID
   * @param targetId The target ID to cancel
   * @returns true on success
   */
  cancelTarget?: (radarId: string, targetId: number) => Promise<boolean>

  /**
   * Handle WebSocket target stream connection.
   * Streams target updates in real-time.
   * @param radarId The radar ID
   * @param ws WebSocket connection to send target updates to
   */
  handleTargetStreamConnection?: (radarId: string, ws: WebSocket) => void

  /**
   * Get ARPA settings.
   * @param radarId The radar ID
   * @returns ARPA settings or null if not supported
   */
  getArpaSettings?: (radarId: string) => Promise<ArpaSettings | null>

  /**
   * Update ARPA settings.
   * @param radarId The radar ID
   * @param settings Partial settings to update
   * @returns Result with success flag and optional error
   */
  setArpaSettings?: (
    radarId: string,
    settings: Partial<ArpaSettings>
  ) => Promise<{ success: boolean; error?: string }>
}

// ============================================================================
// Radar API Interface
// ============================================================================

/**
 * Radar API methods available on the server.
 *
 * @category Radar API
 */
export interface RadarApi {
  /** Register a radar provider plugin */
  register: (pluginId: string, provider: RadarProvider) => void
  /** Unregister a radar provider plugin */
  unRegister: (pluginId: string) => void
  /** Get list of all radars from all providers */
  getRadars: () => Promise<RadarInfo[]>
  /** Get info for a specific radar */
  getRadarInfo: (radarId: string) => Promise<RadarInfo | null>
}

/**
 * Registry interface exposed to plugins via ServerAPI.
 *
 * @category Radar API
 */
export interface RadarProviderRegistry {
  /**
   * Register a radar provider plugin.
   * See Radar Provider Plugins documentation for details.
   *
   * @category Radar API
   */
  registerRadarProvider: (provider: RadarProvider) => void
  /**
   * Access the Radar API to get radar info and manage radars.
   *
   * @category Radar API
   */
  radarApi: RadarApi
}

/**
 * Interface for accessing the Radar API from plugins.
 *
 * This provides typed, in-process programmatic access to the Radar API,
 * similar to {@link history!WithHistoryApi | WithHistoryApi} for the History API.
 *
 * @category Radar API
 *
 * @example
 * ```javascript
 * // Check if Radar API is available
 * if (app.getRadarApi) {
 *   const radarApi = await app.getRadarApi();
 *   const radars = await radarApi.getRadars();
 *   app.debug(`Found ${radars.length} radars`);
 * }
 * ```
 */
export type WithRadarApi = {
  /**
   * Returns a promise for the active Radar API implementation, or rejects if unavailable.
   * The property is optional to support older servers that do not have radar API support.
   *
   * @returns Promise that resolves to a {@link RadarApi} instance if available, or rejects with an error if not.
   */
  getRadarApi?: () => Promise<RadarApi>
}

/**
 * List of registered radar providers (for /_providers endpoint)
 *
 * @hidden visible through API
 * @category Radar API
 */
export interface RadarProviders {
  [id: string]: {
    name: string
    isDefault: boolean
  }
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Type guard to validate a RadarProvider object.
 *
 * @category Radar API
 */
export const isRadarProvider = (obj: unknown): obj is RadarProvider => {
  if (typeof obj !== 'object' || obj === null) {
    return false
  }
  const typedObj = obj as Record<string, unknown>
  const methods = typedObj['methods']
  return (
    typeof typedObj['name'] === 'string' &&
    typeof methods === 'object' &&
    methods !== null &&
    (typeof (methods as Record<string, unknown>)['pluginId'] === 'undefined' ||
      typeof (methods as Record<string, unknown>)['pluginId'] === 'string') &&
    typeof (methods as Record<string, unknown>)['getRadars'] === 'function' &&
    typeof (methods as Record<string, unknown>)['getRadarInfo'] === 'function'
  )
}
