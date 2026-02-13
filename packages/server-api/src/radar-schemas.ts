/**
 * TypeBox Schema Definitions for the Signal K Radar API
 */

import { Type, type Static } from '@sinclair/typebox'

// ---------------------------------------------------------------------------
// Radar status enum
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Control value (auto + value)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Radar controls
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Radar info (response model)
// ---------------------------------------------------------------------------

export const RadarInfoSchema = Type.Object(
  {
    id: Type.String({ description: 'Unique radar identifier' }),
    name: Type.String({ description: 'Display name' }),
    brand: Type.Optional(Type.String({ description: 'Manufacturer/brand' })),
    status: RadarStatusSchema,
    spokesPerRevolution: Type.Integer({
      description: 'Number of spokes per full rotation (e.g. 512, 1024, 2048)',
      examples: [2048]
    }),
    maxSpokeLen: Type.Integer({
      description: 'Maximum spoke length in samples (e.g. 512, 1024)',
      examples: [1024]
    }),
    range: Type.Number({
      description: 'Current range in meters',
      units: 'm'
    }),
    controls: RadarControlsSchema,
    streamUrl: Type.Optional(
      Type.String({
        description:
          'WebSocket URL for spoke stream. If absent, use /radars/{id}/stream'
      })
    )
  },
  {
    $id: 'RadarInfoModel',
    description: 'Information about a radar device'
  }
)
export type RadarInfoSchemaType = Static<typeof RadarInfoSchema>
