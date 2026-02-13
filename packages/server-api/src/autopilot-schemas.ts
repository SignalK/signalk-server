/**
 * TypeBox Schema Definitions for the Signal K Autopilot API
 */

import { Type, type Static } from '@sinclair/typebox'

// ---------------------------------------------------------------------------
// Autopilot state definition
// ---------------------------------------------------------------------------

/** Autopilot state definition (name + engaged flag) */
export const AutopilotStateDefSchema = Type.Object(
  {
    name: Type.String({
      description: 'Autopilot state name',
      examples: ['auto']
    }),
    engaged: Type.Boolean({
      description: 'true if state indicates actively steering',
      examples: [true]
    })
  },
  { $id: 'AutopilotStateDef' }
)

// ---------------------------------------------------------------------------
// Autopilot action definition
// ---------------------------------------------------------------------------

/** Autopilot action definition */
export const AutopilotActionDefSchema = Type.Object(
  {
    id: Type.Union(
      [
        Type.Literal('dodge'),
        Type.Literal('tack'),
        Type.Literal('gybe'),
        Type.Literal('courseCurrentPoint'),
        Type.Literal('courseNextPoint')
      ],
      { description: 'Action identifier' }
    ),
    name: Type.String({ description: 'Display name', examples: ['Tack'] }),
    available: Type.Boolean({
      description: 'true if can be used in current AP mode of operation'
    })
  },
  { $id: 'AutopilotActionDef' }
)

// ---------------------------------------------------------------------------
// Autopilot options
// ---------------------------------------------------------------------------

/** Autopilot options — available states, modes, and actions */
export const AutopilotOptionsSchema = Type.Object(
  {
    states: Type.Array(AutopilotStateDefSchema, {
      description: 'Available autopilot states'
    }),
    modes: Type.Array(Type.String(), {
      description: 'Supported modes of operation',
      examples: [['compass', 'gps', 'wind']]
    }),
    actions: Type.Array(AutopilotActionDefSchema, {
      description: 'Actions the autopilot supports'
    })
  },
  {
    $id: 'AutopilotOptions',
    description: 'Available autopilot states, modes, and actions'
  }
)

// ---------------------------------------------------------------------------
// Autopilot info
// ---------------------------------------------------------------------------

/** Autopilot info — full state of an autopilot device */
export const AutopilotInfoSchema = Type.Object(
  {
    options: AutopilotOptionsSchema,
    target: Type.Union([Type.Number(), Type.Null()], {
      description:
        'Current target value in radians. Interpretation depends on the current mode (heading for compass, wind angle for wind mode).',
      units: 'rad'
    }),
    mode: Type.Union([Type.String(), Type.Null()], {
      description: 'Current autopilot mode'
    }),
    state: Type.Union([Type.String(), Type.Null()], {
      description: 'Current autopilot state'
    }),
    engaged: Type.Boolean({
      description: 'true if autopilot is actively steering'
    })
  },
  {
    $id: 'AutopilotInfo',
    description: 'Full state of an autopilot device'
  }
)
export type AutopilotInfoType = Static<typeof AutopilotInfoSchema>

// ---------------------------------------------------------------------------
// Angle input
// ---------------------------------------------------------------------------

/** Angle input — value with optional units (deg or rad) */
export const AngleInputSchema = Type.Object(
  {
    value: Type.Number({
      description: 'Angle value',
      examples: [129]
    }),
    units: Type.Optional(
      Type.Union([Type.Literal('deg'), Type.Literal('rad')], {
        description: 'Units for the angle value. Default is radians.',
        default: 'rad'
      })
    )
  },
  {
    $id: 'AngleInput',
    description: 'Angle input with optional units (deg or rad)'
  }
)
export type AngleInput = Static<typeof AngleInputSchema>

// ---------------------------------------------------------------------------
// Simple value inputs
// ---------------------------------------------------------------------------

/** String value input (for state, mode) */
export const StringValueInputSchema = Type.Object(
  {
    value: Type.String({ description: 'String value to set' })
  },
  { $id: 'StringValueInput' }
)
