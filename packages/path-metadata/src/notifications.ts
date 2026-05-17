import type { PathMetadataEntry } from './types'

// Properties shared by every notification path (mob, fire, sinking, etc).
// Kept in one place so a tweak to the alarm-state enum or the method
// list lands in every notification at once.
const NOTIFICATION_PROPERTIES = {
  method: {
    description: 'Method to use to raise notifications',
    type: 'array',
    items: {
      enum: ['visual', 'sound']
    }
  },
  state: {
    type: 'string',
    title: 'alarmState',
    description: 'The alarm state when the value is in this zone.',
    default: 'normal',
    enum: ['nominal', 'normal', 'alert', 'warn', 'alarm', 'emergency']
  },
  message: {
    description: 'Message to display or speak',
    type: 'string'
  }
}

export const notificationsMetadata: Record<string, PathMetadataEntry> = {
  '/vessels/*/notifications': {
    description:
      'Notifications currently raised. Major categories have well-defined names, but the tree can be extended by any hierarchical structure'
  },
  '/vessels/*/notifications/mob': {
    description: 'Man overboard',
    properties: NOTIFICATION_PROPERTIES
  },
  '/vessels/*/notifications/fire': {
    description: 'Fire onboard',
    properties: NOTIFICATION_PROPERTIES
  },
  '/vessels/*/notifications/sinking': {
    description: 'Vessel is sinking',
    properties: NOTIFICATION_PROPERTIES
  },
  '/vessels/*/notifications/flooding': {
    description: 'Vessel is flooding',
    properties: NOTIFICATION_PROPERTIES
  },
  '/vessels/*/notifications/collision': {
    description: 'In collision with another vessel or object',
    properties: NOTIFICATION_PROPERTIES
  },
  '/vessels/*/notifications/grounding': {
    description: 'Vessel grounding',
    properties: NOTIFICATION_PROPERTIES
  },
  '/vessels/*/notifications/listing': {
    description: 'Vessel is listing',
    properties: NOTIFICATION_PROPERTIES
  },
  '/vessels/*/notifications/adrift': {
    description: 'Vessel is adrift',
    properties: NOTIFICATION_PROPERTIES
  },
  '/vessels/*/notifications/piracy': {
    description: 'Under attack or danger from pirates',
    properties: NOTIFICATION_PROPERTIES
  },
  '/vessels/*/notifications/abandon': {
    description: 'Abandon ship',
    properties: NOTIFICATION_PROPERTIES
  },
  '/vessels/*/notifications/RegExp': {
    description:
      'This regex pattern is used for validation of the path of the alarm'
  }
}
