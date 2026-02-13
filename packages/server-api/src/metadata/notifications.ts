import type { PathMetadataEntry } from './types'

export const notificationsMetadata: Record<string, PathMetadataEntry> = {
  '/vessels/*/notifications': {
    description:
      'Notifications currently raised. Major categories have well-defined names, but the tree can be extended by any hierarchical structure'
  },
  '/vessels/*/notifications/mob': {
    description: 'Man overboard',
    properties: {
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
  },
  '/vessels/*/notifications/fire': {
    description: 'Fire onboard',
    properties: {
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
  },
  '/vessels/*/notifications/sinking': {
    description: 'Vessel is sinking',
    properties: {
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
  },
  '/vessels/*/notifications/flooding': {
    description: 'Vessel is flooding',
    properties: {
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
  },
  '/vessels/*/notifications/collision': {
    description: 'In collision with another vessel or object',
    properties: {
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
  },
  '/vessels/*/notifications/grounding': {
    description: 'Vessel grounding',
    properties: {
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
  },
  '/vessels/*/notifications/listing': {
    description: 'Vessel is listing',
    properties: {
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
  },
  '/vessels/*/notifications/adrift': {
    description: 'Vessel is adrift',
    properties: {
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
  },
  '/vessels/*/notifications/piracy': {
    description: 'Under attack or danger from pirates',
    properties: {
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
  },
  '/vessels/*/notifications/abandon': {
    description: 'Abandon ship',
    properties: {
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
  },
  '/vessels/*/notifications/RegExp': {
    description:
      'This regex pattern is used for validation of the path of the alarm'
  }
}
