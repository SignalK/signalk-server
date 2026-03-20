import type { PathMetadataEntry } from './types'

export const designMetadata: Record<string, PathMetadataEntry> = {
  '/vessels/*/design': {
    description: 'Design/dimensional data of this vessel'
  },
  '/vessels/*/design/displacement': {
    description: 'Data should be of type number.',
    units: 'kg'
  },
  '/vessels/*/design/aisShipType': {
    description:
      'The ais ship type see http://www.bosunsmate.org/ais/message5.php',
    properties: {
      id: {
        type: 'number',
        description: 'The ship type number'
      },
      name: {
        type: 'string',
        description: 'The ship type name'
      }
    }
  },
  '/vessels/*/design/draft': {
    description: 'The draft of the vessel',
    properties: {
      minimum: {
        description: 'The minimum draft of the vessel',
        type: 'number',
        units: 'm'
      },
      maximum: {
        description: 'The maximum draft of the vessel',
        type: 'number',
        units: 'm'
      },
      current: {
        description: 'The current draft of the vessel',
        type: 'number',
        units: 'm'
      },
      canoe: {
        description:
          'The draft of the vessel without protrusions such as keel, centerboard, rudder',
        type: 'number',
        units: 'm'
      }
    }
  },
  '/vessels/*/design/length': {
    description: 'The various lengths of the vessel',
    properties: {
      overall: {
        type: 'number',
        description: 'Length overall',
        units: 'm'
      },
      hull: {
        type: 'number',
        description: 'Length of hull',
        units: 'm'
      },
      waterline: {
        type: 'number',
        description: 'Length at waterline',
        units: 'm'
      }
    }
  },
  '/vessels/*/design/keel': {
    description: "Information about the vessel's keel"
  },
  '/vessels/*/design/keel/type': {
    description: 'The type of keel.',
    enum: [
      'long',
      'fin',
      'flare',
      'bulb',
      'wing',
      'centerboard',
      'kanting',
      'lifting',
      'daggerboard'
    ]
  },
  '/vessels/*/design/keel/angle': {
    description: 'Data should be of type number.',
    units: 'rad'
  },
  '/vessels/*/design/keel/lift': {
    description: 'Data should be of type number.',
    units: 'ratio'
  },
  '/vessels/*/design/beam': {
    description: 'Data should be of type number.',
    units: 'm'
  },
  '/vessels/*/design/airHeight': {
    description: 'Data should be of type number.',
    units: 'm'
  },
  '/vessels/*/design/rigging': {
    description: "Information about the vessel's rigging"
  },
  '/vessels/*/design/rigging/configuration': {
    description: 'The configuration of the rigging'
  },
  '/vessels/*/design/rigging/masts': {
    description: 'The number of masts on the vessel.'
  }
}
