import {
  DscCall,
  DscPayload,
  MessageLogEntryInput,
  MessagePriority
} from '@signalk/server-api'
import { createDebug } from '../../debug'

const debug = createDebug('signalk-server:api:communications')

function priorityForCategory(category: DscCall['category']): MessagePriority {
  switch (category) {
    case 'distress':
      return 'distress'
    case 'urgency':
      return 'urgency'
    case 'safety':
      return 'safety'
    default:
      return 'routine'
  }
}

export function dscToMessageInput(call: DscCall): MessageLogEntryInput {
  return {
    type: 'dsc',
    // use the call's reported UTC when present; the store falls back to server receive time when undefined
    receivedAt: call.reportedTime,
    sourceRef: call.sourceRef,
    transport: call.transport,
    priority: priorityForCategory(call.category),
    sender: { mmsi: call.mmsi },
    subject: call.distressMmsi ? { mmsi: call.distressMmsi } : undefined,
    position: call.position,
    summary: call.summary,
    payload: {
      format: call.format,
      category: call.category,
      natureOfDistress: call.natureOfDistress,
      distressMmsi: call.distressMmsi,
      reportedTime: call.reportedTime
    } satisfies DscPayload,
    raw: call.raw
  }
}

/**
 * Registration seam: parser libs (or the legacy plugin during migration) call
 * `onCall` with a typed {@link DscCall}; we map it and submit via `app.logMessage`.
 * Returns the bound handler so callers/tests can invoke it directly.
 */
export function registerDscAdapter(app: {
  logMessage?: (e: MessageLogEntryInput) => Promise<unknown>
}): (call: DscCall) => Promise<void> {
  return async (call: DscCall) => {
    if (!app.logMessage) {
      debug('logMessage not available; dropping DSC call')
      return
    }
    await app.logMessage(dscToMessageInput(call))
  }
}
