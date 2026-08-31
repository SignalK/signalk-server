import { OpenApiDescription } from '../swagger'

const tracksApiDoc = {
  openapi: '3.0.0',
  info: {
    version: '0.0.1',
    title: 'Signal K Track API',
    description:
      'API for querying recorded vessel tracks — where vessels have actually been, over time.\n\n' +
      'A track is distinct from a route in `resources/routes`, which is a course someone authored and intends to follow, and from an uploaded GPX track in `resources/tracks`, which is a named document. A track here is recorded position data: unnamed, time-ordered, and queried by time window and area.\n\n' +
      'Storage is not defined by this API. Providers are plugins that record positions and may keep them in SQLite, a time-series database, Parquet files, or anything else.\n\n' +
      'The time range is given as **from**, **to** and **duration** in any workable combination; an omitted **to** is resolved to now by the server, so every provider sees the same window. A time window is required unless a single **context** is requested, since an unbounded query across every recorded vessel can span years of data.\n\n' +
      'The full time range asked for is always returned. Where a result would be too large, providers reduce the number of *points* — by resolution, point budget or simplification — and report what they applied in the response, rather than silently narrowing the time range.',
    license: {
      name: 'Apache 2.0',
      url: 'http://www.apache.org/licenses/LICENSE-2.0.html'
    }
  },
  servers: [{ url: '/signalk/v2/api/tracks' }],
  components: {
    schemas: {
      TrackProperties: {
        type: 'object',
        required: ['context', 'isSelf', 'from', 'to', 'pointCount'],
        properties: {
          context: {
            type: 'string',
            description: 'Signal K context this track belongs to',
            example: 'vessels.urn:mrn:imo:mmsi:123456789'
          },
          isSelf: {
            type: 'boolean',
            description: "Whether this is the own vessel's track"
          },
          contextName: {
            type: 'string',
            description:
              'Name of the vessel, aircraft or other context, where known. Not a name for the track itself.',
            example: 'Ariadne'
          },
          from: {
            type: 'string',
            format: 'date-time',
            description: 'Time of the first returned point'
          },
          to: {
            type: 'string',
            format: 'date-time',
            description: 'Time of the last returned point'
          },
          bbox: {
            type: 'array',
            items: { type: 'number' },
            minItems: 4,
            maxItems: 4,
            description:
              'Bounding box of the returned geometry as [west, south, east, north]'
          },
          pointCount: {
            type: 'integer',
            description: 'Number of points returned across all segments'
          },
          resolution: {
            type: 'string',
            format: 'duration',
            description:
              'Spacing actually applied. Present when the provider thinned the track, so a client can tell it did not receive full detail.',
            example: 'PT1M'
          },
          epsilon: {
            type: 'number',
            description:
              'Simplification tolerance actually applied, in metres. Present when the provider simplified the geometry.'
          },
          coordTimes: {
            type: 'array',
            description:
              'Recording time of every point, ISO 8601 UTC, nested to match geometry.coordinates: coordTimes[i][j] is when coordinates[i][j] was recorded. Follows the coordTimes convention used by GPX to GeoJSON converters; the nesting for MultiLineString is specified here because the convention itself covers only LineString.',
            items: {
              type: 'array',
              items: { type: 'string', format: 'date-time' }
            }
          },
          appliedProperties: {
            type: 'array',
            description:
              'Which of the requested properties the provider actually returned. Reported rather than inferred, for the same reason resolution and epsilon are: a client must be able to tell "this provider does not have that path" from "that path had no values in this window".',
            items: { type: 'string' }
          },
          values: {
            type: 'object',
            description:
              'Values for each requested path, keyed by path and nested to match geometry.coordinates: values[path][i][j] belongs with coordinates[i][j]. A position with no value for a path at that instant carries null rather than being omitted, so the arrays stay aligned.',
            additionalProperties: {
              type: 'array',
              items: {
                type: 'array',
                items: {
                  nullable: true,
                  oneOf: [{ type: 'number' }, { type: 'string' }]
                }
              }
            }
          }
        }
      },
      TrackFeature: {
        type: 'object',
        required: ['type', 'geometry', 'properties'],
        properties: {
          type: { type: 'string', enum: ['Feature'] },
          geometry: {
            nullable: true,
            description:
              'MultiLineString, so that a gap in recording starts a new segment rather than drawing a line across a stretch the vessel did not travel. Null when geometry=false was requested.',
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['MultiLineString'] },
              coordinates: {
                type: 'array',
                items: {
                  type: 'array',
                  items: {
                    type: 'array',
                    items: { type: 'number' },
                    minItems: 2,
                    maxItems: 2
                  }
                }
              }
            }
          },
          properties: { $ref: '#/components/schemas/TrackProperties' }
        }
      },
      TracksResponse: {
        type: 'object',
        required: ['type', 'features'],
        properties: {
          type: { type: 'string', enum: ['FeatureCollection'] },
          features: {
            type: 'array',
            items: { $ref: '#/components/schemas/TrackFeature' }
          }
        }
      }
    },
    parameters: {
      Contexts: {
        name: 'contexts',
        in: 'query',
        description:
          "Comma-separated Signal K contexts. A bare id is qualified with 'vessels.'; other prefixes such as 'aircraft.' are accepted. Defaults to the own vessel. Also accepted as 'context'.",
        schema: { type: 'string', example: 'self' }
      },
      From: {
        name: 'from',
        in: 'query',
        description: 'Start of the time range, as an ISO 8601 timestamp',
        schema: {
          type: 'string',
          format: 'date-time',
          example: '2026-06-01T00:00:00Z'
        }
      },
      To: {
        name: 'to',
        in: 'query',
        description:
          'End of the time range, as an ISO 8601 timestamp. Defaults to now.',
        schema: { type: 'string', format: 'date-time' }
      },
      Duration: {
        name: 'duration',
        in: 'query',
        description:
          'Length of the time range, as an ISO 8601 duration string or an integer number of seconds. Must be positive. See https://datatracker.ietf.org/doc/html/rfc3339#appendix-A',
        schema: {
          oneOf: [
            { type: 'integer', minimum: 1, description: 'Duration in seconds' },
            {
              type: 'string',
              format: 'duration',
              description: 'Positive ISO 8601 duration',
              example: 'P7D'
            }
          ]
        }
      },
      Bbox: {
        name: 'bbox',
        in: 'query',
        description:
          "Only return tracks passing through this box, as west,south,east,north in GeoJSON coordinate order. Matching is intersection anywhere within the time window, not the vessel's current position: a vessel that crossed the box an hour ago and has since left still matches. A west edge numerically greater than the east edge describes a box crossing the antimeridian.",
        schema: { type: 'string', example: '24.5,59.9,25.2,60.3' }
      },
      Resolution: {
        name: 'resolution',
        in: 'query',
        description:
          'Minimum spacing between returned points, as an ISO 8601 duration or an integer number of seconds. Must be positive.',
        schema: {
          oneOf: [
            { type: 'integer', minimum: 1 },
            {
              type: 'string',
              format: 'duration',
              description: 'Positive ISO 8601 duration',
              example: 'PT1M'
            }
          ]
        }
      },
      MaxPoints: {
        name: 'maxPoints',
        in: 'query',
        description:
          'Upper bound on points returned per track. A budget rather than a fidelity contract, for clients that must bound transfer and rendering cost regardless of how convoluted a track is.',
        schema: { type: 'integer', minimum: 1, example: 5000 }
      },
      Simplify: {
        name: 'simplify',
        in: 'query',
        description:
          'Simplify the geometry, dropping points that do not change the shape of the line. With a bounding box and no explicit epsilon, the provider chooses a tolerance suited to the size of the box.',
        schema: { type: 'boolean' }
      },
      Epsilon: {
        name: 'epsilon',
        in: 'query',
        description:
          'Simplification tolerance in metres. Implies simplify=true.',
        schema: {
          type: 'number',
          exclusiveMinimum: true,
          minimum: 0,
          example: 5
        }
      },
      Properties: {
        name: 'properties',
        in: 'query',
        description:
          'Comma-separated Signal K paths to return alongside each position, nested to match coordinates the way coordTimes is. Lets a client colour a track by speed, or derive a route from a recorded passage, without querying the History API separately and joining the two responses by timestamp. Provider-optional: what was actually returned is listed in properties.appliedProperties.',
        schema: {
          type: 'string',
          example: 'navigation.speedOverGround,environment.wind.speedApparent'
        }
      },
      Times: {
        name: 'times',
        in: 'query',
        description:
          'Include the recording time of each point as properties.coordTimes.',
        schema: { type: 'boolean' }
      },
      Geometry: {
        name: 'geometry',
        in: 'query',
        description:
          'Set to false to return metadata only, omitting coordinates. Useful for listing which tracks exist in an area or period before fetching any of them.',
        schema: { type: 'boolean', default: true }
      },
      Provider: {
        name: 'provider',
        in: 'query',
        description:
          'Query a specific track provider rather than the default one.',
        schema: { type: 'string' }
      }
    }
  },
  paths: {
    '/': {
      get: {
        tags: ['tracks'],
        summary: 'Retrieve recorded tracks',
        description:
          'Returns a GeoJSON FeatureCollection, one Feature per context.\n\n' +
          'A time window is required unless a single context is given: `?context=self` with no window is a legitimate request for an entire recorded history, while the same query across every vessel a server has seen is not.',
        parameters: [
          { $ref: '#/components/parameters/Contexts' },
          { $ref: '#/components/parameters/From' },
          { $ref: '#/components/parameters/To' },
          { $ref: '#/components/parameters/Duration' },
          { $ref: '#/components/parameters/Bbox' },
          { $ref: '#/components/parameters/Resolution' },
          { $ref: '#/components/parameters/MaxPoints' },
          { $ref: '#/components/parameters/Simplify' },
          { $ref: '#/components/parameters/Epsilon' },
          { $ref: '#/components/parameters/Times' },
          { $ref: '#/components/parameters/Properties' },
          { $ref: '#/components/parameters/Geometry' },
          { $ref: '#/components/parameters/Provider' }
        ],
        responses: {
          '200': {
            description: 'Tracks matching the query',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/TracksResponse' }
              }
            }
          },
          '400': { description: 'Invalid query parameters' },
          '500': { description: 'The track provider failed' },
          '501': { description: 'No track api provider configured' }
        }
      }
    },
    '/contexts': {
      get: {
        tags: ['tracks'],
        summary: 'List contexts with track data in the window',
        description:
          'As with the tracks route, a time window is required unless a single context is given, so a bare request with no parameters returns 400.',
        parameters: [
          { $ref: '#/components/parameters/Contexts' },
          { $ref: '#/components/parameters/From' },
          { $ref: '#/components/parameters/To' },
          { $ref: '#/components/parameters/Duration' },
          { $ref: '#/components/parameters/Bbox' },
          { $ref: '#/components/parameters/Provider' }
        ],
        responses: {
          '200': {
            description: 'Contexts with recorded track data',
            content: {
              'application/json': {
                schema: { type: 'array', items: { type: 'string' } }
              }
            }
          },
          '400': { description: 'Invalid query parameters' },
          '500': { description: 'The track provider failed' },
          '501': { description: 'No track api provider configured' }
        }
      }
    },
    '/_providers': {
      get: {
        tags: ['provider'],
        summary: 'List registered track providers',
        responses: {
          '200': {
            description: 'Registered providers and which is the default',
            content: { 'application/json': { schema: { type: 'object' } } }
          }
        }
      }
    }
  }
}

export const tracksApiRecord = {
  name: 'tracks',
  path: '/signalk/v2/api/tracks',
  apiDoc: tracksApiDoc as unknown as OpenApiDescription
}
