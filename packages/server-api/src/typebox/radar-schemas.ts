/**
 * TypeBox Schema Definitions for the Signal K Radar API
 */

import { Type, type Static } from '@sinclair/typebox'

export const RadarStatusSchema = Type.Union(
  [
    Type.Literal('off'),
    Type.Literal('standby'),
    Type.Literal('transmit'),
    Type.Literal('warming')
  ],
  {
    $id: 'RadarStatus',
    description: 'Current operational status of the radar'
  }
)
export type RadarStatusSchemaType = Static<typeof RadarStatusSchema>

export const RadarControlValueSchema = Type.Object(
  {
    auto: Type.Boolean({
      description: 'Whether automatic adjustment is enabled'
    }),
    value: Type.Number({
      description:
        'Current control value. The valid range depends on the radar hardware — see the capability manifest at GET /radars/{id}/capabilities for min/max/step per control.'
    })
  },
  {
    $id: 'RadarControlValue',
    description: 'A radar control with auto mode and a numeric value'
  }
)
export type RadarControlValueSchemaType = Static<typeof RadarControlValueSchema>

export const RadarControlsSchema = Type.Object(
  {
    gain: Type.Ref(RadarControlValueSchema, {
      description: 'Receiver gain control'
    }),
    sea: Type.Optional(
      Type.Ref(RadarControlValueSchema, {
        description:
          'Sea clutter rejection control. Present when supported by the radar.'
      })
    ),
    rain: Type.Optional(
      Type.Object(
        {
          value: Type.Number({
            description:
              'Rain clutter rejection level. Valid range is hardware-dependent — see capability manifest.'
          })
        },
        {
          description:
            'Rain clutter rejection control (no auto mode). Present when supported by the radar.'
        }
      )
    )
  },
  {
    $id: 'RadarControlsModel',
    description:
      'Current control settings for a radar. Additional radar-specific controls beyond gain/sea/rain may be present.'
  }
)
export type RadarControlsSchemaType = Static<typeof RadarControlsSchema>

export const RadarInfoSchema = Type.Object(
  {
    name: Type.String({
      description: 'User-defined name, or the auto-detected model name'
    }),
    brand: Type.String({
      description:
        'Radar manufacturer brand (Navico, Furuno, Raymarine, Garmin, Emulator)'
    }),
    model: Type.Optional(
      Type.String({ description: 'Radar model name, if detected' })
    ),
    radarIpAddress: Type.String({
      description: 'IP address of the radar unit on the network'
    })
    // No stream URLs: the spoke WS (…/radars/{id}/spokes) and the control/target
    // stream (/signalk/v1/stream) are always reached by convention from the host
    // serving this response.
  },
  {
    $id: 'RadarInfoModel',
    description:
      'Discovery information for a radar device. Live state (status, controls) is on /state; static parameters on /capabilities. Stream URLs are reached by convention, not listed here.'
  }
)
export type RadarInfoSchemaType = Static<typeof RadarInfoSchema>

export const RadarsResponseSchema = Type.Object(
  {
    version: Type.String({
      description: 'Radar API version (semver) this response conforms to'
    }),
    radars: Type.Record(Type.String(), RadarInfoSchema, {
      description: 'Discovered radars, keyed by radar ID'
    })
  },
  {
    $id: 'RadarsResponse',
    description: 'Response for GET /radars'
  }
)
export type RadarsResponseSchemaType = Static<typeof RadarsResponseSchema>
