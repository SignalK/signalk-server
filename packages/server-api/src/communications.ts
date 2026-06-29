/**
 * Received-message log types. Generic envelope; DSC is the only v1 `type`.
 * @category Communications API
 */

export type MessageType = 'dsc'
export type MessagePriority = 'distress' | 'urgency' | 'safety' | 'routine'
export type MessageTransport = 'nmea0183' | 'nmea2000'

export interface MessageSender {
  mmsi?: string
  name?: string
}

/** The vessel a relay/ack/cancel refers to (distinct from the sender). */
export interface MessageSubject {
  mmsi?: string
}

export interface MessagePosition {
  latitude: number
  longitude: number
}

/** Audit trail mirroring the linked notification's ack/clear lifecycle. */
export interface MessageDisposition {
  acknowledgedAt?: string
  clearedAt?: string
}

/** Fields every message carries, regardless of `type`. */
export interface MessageLogEntryCommon {
  /** ISO 8601; defaults to server receive time when omitted. */
  receivedAt?: string
  /** `$source` — connection/device. */
  sourceRef?: string
  transport?: MessageTransport
  priority: MessagePriority
  sender: MessageSender
  subject?: MessageSubject
  position?: MessagePosition
  summary: string
  /** Original sentence(s) / PGN text. */
  raw: string
  /** Link to a live notification, if one was raised. */
  notificationId?: string
}

/**
 * What a producer submits to `app.logMessage()`. Server assigns
 * id/receivedAt/disposition. Discriminated on `type` so each message type
 * carries its own typed `payload`; new types add an arm without touching storage.
 */
export type MessageLogEntryInput = MessageLogEntryCommon & {
  type: 'dsc'
  payload: DscPayload
}

/** A persisted entry: the input plus server-assigned fields. */
export type MessageLogEntry = MessageLogEntryInput & {
  id: string
  receivedAt: string
  disposition: MessageDisposition
}

export interface MessageLogQuery {
  /** ISO 8601 — inclusive lower bound on receivedAt. */
  from?: string
  /** ISO 8601 — inclusive upper bound on receivedAt. */
  to?: string
  type?: MessageType
  priority?: MessagePriority
  /** Filter by sender MMSI. */
  sender?: string
  limit?: number
  order?: 'asc' | 'desc'
}

/** Mutable patch shape applied via `MessageLogStore.update`; distinct from `MessageDisposition`, the stored audit state. */
export interface DispositionPatch {
  acknowledgedAt?: string
  clearedAt?: string
}

/**
 * Storage seam. Only `SqliteMessageLogStore` ships in v1; a Postgres-class
 * backend can implement this and be registered later.
 * @category Communications API
 */
export interface MessageLogStore {
  append(entry: MessageLogEntryInput): Promise<MessageLogEntry>
  get(id: string): Promise<MessageLogEntry | undefined>
  query(filter: MessageLogQuery): Promise<MessageLogEntry[]>
  update(
    id: string,
    patch: DispositionPatch
  ): Promise<MessageLogEntry | undefined>
}

/**
 * App surface added by the Communications API: the single ingestion door
 * for all message producers (parsers, manual entries, future NAVTEX/AIS-text).
 * @category Communications API
 */
export type WithMessageLog = {
  logMessage?: (entry: MessageLogEntryInput) => Promise<MessageLogEntry>
}

// ---- DSC type-specific payload + parser contract ----

/** Structured DSC call emitted by a transport parser (NMEA0183 or N2K PGN 129808). */
export interface DscCall {
  /** Format specifier symbol minus leading 1 (e.g. '12' = distress alert). */
  format: string
  category: 'distress' | 'urgency' | 'safety' | 'routine' | 'unknown'
  /** Sender MMSI as a string (preserve leading zeros). */
  mmsi?: string
  /** Nature of distress (distress/relay calls). */
  natureOfDistress?: string
  /** MMSI of the vessel in distress on relays/acks/cancellations. */
  distressMmsi?: string
  position?: MessagePosition
  /** UTC time reported in the call, if present. */
  reportedTime?: string
  transport: MessageTransport
  /** Human one-liner summary. */
  summary: string
  /** Original sentence(s) / PGN text. */
  raw: string
  /** `$source` of the producing connection. */
  sourceRef?: string
}

/** DSC content stored in `MessageLogEntry.payload`. */
export interface DscPayload {
  format: string
  category: DscCall['category']
  natureOfDistress?: string
  distressMmsi?: string
  reportedTime?: string
}
