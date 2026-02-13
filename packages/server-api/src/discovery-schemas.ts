/**
 * TypeBox Schema Definitions for the Signal K Discovery API
 */

import { Type, type Static } from '@sinclair/typebox'

// ---------------------------------------------------------------------------
// Endpoint schemas
// ---------------------------------------------------------------------------

/**
 * v1 endpoint descriptor — protocol addresses for a specific API version.
 */
export const V1EndpointSchema = Type.Object(
  {
    version: Type.String({
      description: 'Version of the Signal K API',
      examples: ['1.1.0']
    }),
    'signalk-http': Type.Optional(
      Type.String({
        description: "Address of the server's http API.",
        examples: ['http://192.168.1.88:3000/signalk/v1/api/']
      })
    ),
    'signalk-ws': Type.Optional(
      Type.String({
        description: "Address of the server's WebSocket API.",
        examples: ['ws://192.168.1.88:3000/signalk/v1/stream']
      })
    ),
    'signalk-tcp': Type.Optional(
      Type.String({
        description: "Address of the server's Signal K over TCP API.",
        examples: ['tcp://192.168.1.88:8375']
      })
    )
  },
  { $id: 'V1Endpoint' }
)

// ---------------------------------------------------------------------------
// Discovery data
// ---------------------------------------------------------------------------

/**
 * Discovery response — server version and service endpoints.
 */
export const DiscoveryDataSchema = Type.Object(
  {
    endpoints: Type.Object({
      v1: Type.Optional(V1EndpointSchema)
    }),
    server: Type.Object({
      id: Type.String({
        description: 'Id of the server implementation',
        examples: ['signalk-server-node']
      }),
      version: Type.String({
        description: 'Server software version'
      })
    })
  },
  {
    $id: 'DiscoveryData',
    description: 'Server version and service endpoint discovery data'
  }
)
export type DiscoveryData = Static<typeof DiscoveryDataSchema>

// ---------------------------------------------------------------------------
// Plugin metadata
// ---------------------------------------------------------------------------

/**
 * Plugin metadata for feature discovery.
 */
export const PluginMetaDataSchema = Type.Object(
  {
    id: Type.String({ description: 'Plugin ID.' }),
    name: Type.String({ description: 'Plugin name.' }),
    version: Type.String({ description: 'Plugin version.' })
  },
  {
    $id: 'PluginMetaData',
    description: 'Plugin metadata.'
  }
)
export type PluginMetaData = Static<typeof PluginMetaDataSchema>

// ---------------------------------------------------------------------------
// Features model
// ---------------------------------------------------------------------------

/**
 * Server features response — available APIs and installed plugins.
 */
export const FeaturesModelSchema = Type.Object(
  {
    apis: Type.Array(Type.String(), {
      description: 'Implemented APIs.'
    }),
    plugins: Type.Array(PluginMetaDataSchema, {
      description: 'Installed Plugins.'
    })
  },
  {
    $id: 'FeaturesModel',
    description: 'Features response'
  }
)
export type FeaturesModel = Static<typeof FeaturesModelSchema>
