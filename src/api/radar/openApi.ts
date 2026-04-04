import { OpenApiDescription } from '../swagger'

const radarIdParam = {
  name: 'radar_id',
  in: 'path',
  required: true,
  schema: { type: 'string' },
  description: "Radar identifier (e.g., 'nav1034A')",
  example: 'nav1034A'
}

const radarApiDoc = {
  openapi: '3.0.0',
  info: {
    title: 'Signal K Radar API',
    version: '3.1.0',
    description:
      'REST API for controlling marine radars. Supports Navico (Simrad, B&G, Lowrance), ' +
      'Furuno, Raymarine, and Garmin radar systems. Provides endpoints for discovering radars, ' +
      'reading and setting control values, and accessing radar data via WebSocket streams.'
  },
  tags: [
    { name: 'Radars', description: 'Radar discovery and capabilities' },
    { name: 'Controls', description: 'Read and modify radar control settings' },
    { name: 'Targets', description: 'ARPA target acquisition and tracking' },
    {
      name: 'Configuration',
      description: 'Server and network configuration'
    },
    {
      name: 'Stream',
      description: 'Real-time WebSocket stream for control updates'
    }
  ],
  components: {
    schemas: {
      RadarInfo: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'User-defined name or auto-detected model name'
          },
          brand: {
            type: 'string',
            description:
              'Radar manufacturer brand (Navico, Furuno, Raymarine, Garmin, Emulator)'
          },
          model: {
            type: 'string',
            description: 'Radar model name if detected'
          },
          spokeDataUrl: {
            type: 'string',
            description:
              'WebSocket URL for receiving raw radar spoke data (binary)'
          },
          streamUrl: {
            type: 'string',
            description: 'WebSocket URL for Signal K control stream (JSON)'
          },
          radarIpAddress: {
            type: 'string',
            description: 'IP address of the radar unit on the network'
          }
        },
        required: [
          'name',
          'brand',
          'spokeDataUrl',
          'streamUrl',
          'radarIpAddress'
        ]
      },
      Capabilities: {
        type: 'object',
        properties: {
          maxRange: {
            type: 'integer',
            description: 'Maximum supported range in meters'
          },
          minRange: {
            type: 'integer',
            description: 'Minimum supported range in meters'
          },
          supportedRanges: {
            type: 'array',
            items: { type: 'integer' },
            description: 'All supported range values in meters'
          },
          spokesPerRevolution: {
            type: 'integer',
            description: 'Number of spokes per full rotation'
          },
          maxSpokeLength: {
            type: 'integer',
            description: 'Maximum number of samples per spoke'
          },
          pixelValues: {
            type: 'integer',
            description: 'Number of distinct pixel intensity values'
          },
          legend: {
            type: 'object',
            description: 'Color mapping for interpreting spoke data'
          },
          hasDoppler: { type: 'boolean' },
          hasDualRange: { type: 'boolean' },
          hasDualRadar: { type: 'boolean' },
          hasSparseSpokes: { type: 'boolean' },
          noTransmitSectors: {
            type: 'integer',
            description: 'Number of configurable no-transmit sectors'
          },
          stationary: {
            type: 'boolean',
            description:
              'Whether radar is configured as stationary (shore-based)'
          },
          controls: {
            type: 'object',
            description: 'Map of control IDs to their definitions',
            additionalProperties: {
              $ref: '#/components/schemas/ControlDefinition'
            }
          }
        },
        required: [
          'maxRange',
          'minRange',
          'supportedRanges',
          'spokesPerRevolution',
          'maxSpokeLength',
          'pixelValues',
          'legend',
          'hasDoppler',
          'hasDualRange',
          'hasDualRadar',
          'hasSparseSpokes',
          'noTransmitSectors',
          'stationary',
          'controls'
        ]
      },
      ControlDefinition: {
        type: 'object',
        properties: {
          id: { type: 'integer', description: 'Numeric control identifier' },
          name: { type: 'string', description: 'Human-readable control name' },
          dataType: {
            type: 'string',
            enum: [
              'number',
              'enum',
              'string',
              'button',
              'sector',
              'zone',
              'rect'
            ],
            description: 'Control data type'
          },
          category: {
            type: 'string',
            description:
              'Control category (e.g., display, installation, targets)'
          },
          minValue: { type: 'number' },
          maxValue: { type: 'number' },
          stepValue: { type: 'number' },
          units: {
            type: 'string',
            description: 'SI unit (m, rad, s, m/s, rad/s)'
          },
          description: { type: 'string' },
          descriptions: {
            type: 'object',
            description: 'Value descriptions for enum types',
            additionalProperties: { type: 'string' }
          },
          hasAuto: { type: 'boolean' },
          hasAutoAdjustable: { type: 'boolean' },
          hasEnabled: {
            type: 'boolean',
            description:
              'Whether the control has an enabled/disabled toggle (sector, zone, rect)'
          },
          isReadOnly: {
            type: 'boolean',
            description: 'Whether the control is read-only'
          },
          maxDistance: {
            type: 'number',
            description: 'Maximum distance for zone controls (meters)'
          },
          validValues: {
            type: 'array',
            items: { type: 'integer' },
            description:
              'Subset of values that can be set by clients (enum controls)'
          }
        },
        required: ['id', 'name', 'dataType', 'category']
      },
      ControlValue: {
        type: 'object',
        description:
          'Control value. Fields present depend on the control dataType.',
        properties: {
          value: {
            description: 'The control value (numeric or string)'
          },
          auto: {
            type: 'boolean',
            description: 'Whether automatic mode is enabled'
          },
          autoValue: {
            type: 'number',
            description: 'Adjustment when auto=true'
          },
          timestamp: {
            type: 'string',
            format: 'date-time',
            description: 'ISO 8601 timestamp when value was last changed'
          },
          enabled: {
            type: 'boolean',
            description: 'Whether the control is enabled (sector, zone, rect)'
          },
          endValue: {
            type: 'number',
            description: 'End angle in radians (sector, zone)'
          },
          startDistance: {
            type: 'number',
            description: 'Inner radius in meters (zone)'
          },
          endDistance: {
            type: 'number',
            description: 'Outer radius in meters (zone)'
          },
          x1: {
            type: 'number',
            description: 'First corner X in meters (rect)'
          },
          y1: {
            type: 'number',
            description: 'First corner Y in meters (rect)'
          },
          x2: {
            type: 'number',
            description: 'Second corner X in meters (rect)'
          },
          y2: {
            type: 'number',
            description: 'Second corner Y in meters (rect)'
          },
          width: {
            type: 'number',
            description: 'Perpendicular width in meters (rect)'
          },
          allowed: {
            type: 'boolean',
            description:
              'Whether changing this control is currently allowed (read-only)'
          },
          error: {
            type: 'string',
            description:
              'Error message if the control change failed (read-only)'
          }
        }
      },
      ArpaTarget: {
        type: 'object',
        properties: {
          id: {
            type: 'integer',
            description: 'Target ID (unique within radar)'
          },
          status: {
            type: 'string',
            enum: ['tracking', 'acquiring', 'lost'],
            description: 'Current tracking status'
          },
          position: {
            type: 'object',
            properties: {
              bearing: {
                type: 'number',
                description: 'Bearing from radar in radians [0, 2π)'
              },
              distance: {
                type: 'number',
                description: 'Distance from radar in meters'
              },
              latitude: { type: 'number' },
              longitude: { type: 'number' }
            },
            required: ['bearing', 'distance']
          },
          motion: {
            type: 'object',
            description:
              'Target motion. Omitted if not yet known; present with speed=0 for stationary targets.',
            properties: {
              course: {
                type: 'number',
                description: 'Course over ground in radians [0, 2π)'
              },
              speed: { type: 'number', description: 'Speed in m/s' }
            },
            required: ['course', 'speed']
          },
          danger: {
            type: 'object',
            description:
              'Collision danger assessment. Omitted when vessels are diverging.',
            properties: {
              cpa: {
                type: 'number',
                description: 'Closest Point of Approach in meters'
              },
              tcpa: {
                type: 'number',
                description: 'Time to CPA in seconds'
              }
            },
            required: ['cpa', 'tcpa']
          },
          acquisition: {
            type: 'string',
            enum: ['auto', 'manual'],
            description: 'How target was acquired'
          },
          sourceZone: {
            type: 'integer',
            description:
              'Guard zone that acquired this target (1 or 2). Omitted for manual acquisition.'
          },
          firstSeen: {
            type: 'string',
            format: 'date-time',
            description: 'ISO 8601 timestamp when target was first seen'
          },
          lastSeen: {
            type: 'string',
            format: 'date-time',
            description: 'ISO 8601 timestamp when target was last updated'
          }
        },
        required: [
          'id',
          'status',
          'position',
          'acquisition',
          'firstSeen',
          'lastSeen'
        ]
      },
      AcquireTargetRequest: {
        type: 'object',
        properties: {
          bearing: {
            type: 'number',
            description: 'Target bearing in radians [0, 2π)'
          },
          distance: {
            type: 'number',
            description: 'Target distance in meters'
          }
        },
        required: ['bearing', 'distance']
      },
      AcquireTargetResponse: {
        type: 'object',
        properties: {
          targetId: {
            type: 'integer',
            description: 'Assigned target ID (0 until confirmed by tracker)'
          },
          radarId: {
            type: 'string',
            description: 'Radar tracking this target'
          }
        },
        required: ['targetId', 'radarId']
      }
    }
  },
  paths: {
    '/signalk/v2/api/vessels/self/radars': {
      get: {
        tags: ['Radars'],
        summary: 'List all active radars',
        description:
          'Returns all radars detected on the network. Each entry includes WebSocket URLs for spoke data and control streams.',
        responses: {
          '200': {
            description: 'Map of radar IDs to radar information',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: {
                    $ref: '#/components/schemas/RadarInfo'
                  }
                }
              }
            }
          }
        }
      }
    },
    '/signalk/v2/api/vessels/self/radars/interfaces': {
      get: {
        tags: ['Configuration'],
        summary: 'List network interfaces',
        description:
          'Returns network interfaces and which radar brands are listening on each.',
        responses: {
          '200': {
            description: 'Network interfaces with radar brands',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    brands: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Radar brands compiled into this server'
                    },
                    interfaces: {
                      type: 'object',
                      additionalProperties: {
                        type: 'object',
                        properties: {
                          status: { type: 'string' },
                          ip: { type: 'string' },
                          netmask: { type: 'string' },
                          listeners: {
                            type: 'object',
                            additionalProperties: { type: 'string' }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/signalk/v2/api/vessels/self/radars/{radar_id}/capabilities': {
      get: {
        tags: ['Radars'],
        summary: 'Get radar capabilities',
        description:
          'Returns static information about a radar including supported ranges, spoke resolution, Doppler support, and available controls.',
        parameters: [radarIdParam],
        responses: {
          '200': {
            description: 'Radar capabilities and control definitions',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Capabilities' }
              }
            }
          },
          '404': { description: 'Radar not found' }
        }
      }
    },
    '/signalk/v2/api/vessels/self/radars/{radar_id}/controls': {
      get: {
        tags: ['Controls'],
        summary: 'Get all control values',
        description:
          'Returns current values for all controls of the specified radar.',
        parameters: [radarIdParam],
        responses: {
          '200': {
            description: 'All control values keyed by control name',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: {
                    $ref: '#/components/schemas/ControlValue'
                  }
                }
              }
            }
          },
          '404': { description: 'Radar not found' }
        }
      }
    },
    '/signalk/v2/api/vessels/self/radars/{radar_id}/controls/{control_id}': {
      get: {
        tags: ['Controls'],
        summary: 'Get a single control value',
        description: 'Returns the current value of a specific radar control.',
        parameters: [
          radarIdParam,
          {
            name: 'control_id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: "Control identifier (e.g., 'gain', 'range', 'sea')",
            example: 'gain'
          }
        ],
        responses: {
          '200': {
            description: 'Control value',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ControlValue' }
              }
            }
          },
          '404': { description: 'Control or radar not found' }
        }
      },
      put: {
        tags: ['Controls'],
        summary: 'Set a control value',
        description:
          'Sets the value of a specific radar control. Request body varies by control type.',
        parameters: [
          radarIdParam,
          {
            name: 'control_id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            example: 'gain'
          }
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ControlValue' }
            }
          }
        },
        responses: {
          '200': { description: 'Control updated' },
          '400': { description: 'Invalid value' },
          '404': { description: 'Control or radar not found' }
        }
      }
    },
    '/signalk/v2/api/vessels/self/radars/{radar_id}/targets': {
      get: {
        tags: ['Targets'],
        summary: 'Get tracked targets',
        description:
          'Returns all currently tracked ARPA/MARPA targets for this radar.',
        parameters: [radarIdParam],
        responses: {
          '200': {
            description: 'Array of tracked targets',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/ArpaTarget' }
                }
              }
            }
          },
          '404': { description: 'Radar not found' },
          '501': { description: 'Provider does not support (M)ARPA target tracking' }
        }
      },
      post: {
        tags: ['Targets'],
        summary: 'Acquire target manually',
        description:
          'Manually acquire a target at the specified bearing and distance.',
        parameters: [radarIdParam],
        requestBody: {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AcquireTargetRequest' }
            }
          }
        },
        responses: {
          '200': {
            description: 'Target acquired',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AcquireTargetResponse' }
              }
            }
          },
          '400': { description: 'Invalid position' },
          '404': { description: 'Radar not found' },
          '501': {
            description: 'Provider does not support (M)ARPA target tracking'
          }
        }
      }
    },
    '/signalk/v2/api/vessels/self/radars/{radar_id}/targets/{target_id}': {
      delete: {
        tags: ['Targets'],
        summary: 'Cancel target tracking',
        description: 'Stop tracking the specified target.',
        parameters: [
          radarIdParam,
          {
            name: 'target_id',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
            description: 'Target identifier',
            example: 1
          }
        ],
        responses: {
          '200': { description: 'Target tracking cancelled' },
          '400': { description: 'Invalid target ID' },
          '404': { description: 'Radar or target not found' },
          '501': {
            description: 'Provider does not support (M)ARPA target tracking'
          }
        }
      }
    }
  }
}

export const radarApiRecord = {
  name: 'radar',
  path: '/signalk/v2/api/vessels/self/radars',
  apiDoc: radarApiDoc as unknown as OpenApiDescription
}
