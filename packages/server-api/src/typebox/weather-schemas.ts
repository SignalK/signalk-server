/**
 * TypeBox Schema Definitions for the Signal K Weather API
 *
 * Units follow SI conventions: K (temperature), Pa (pressure), m/s (speed),
 * rad (direction), m (distance/visibility), ratio (humidity/cloud).
 */

import { Type, type Static } from '@sinclair/typebox'
import { IsoTimeSchema } from './shared-schemas'

// ---------------------------------------------------------------------------
// Weather data model
// ---------------------------------------------------------------------------

/** Weather data type */
export const WeatherDataTypeSchema = Type.Union(
  [Type.Literal('daily'), Type.Literal('point'), Type.Literal('observation')],
  { $id: 'WeatherDataType' }
)

/** Pressure tendency */
export const PressureTendencySchema = Type.Union(
  [
    Type.Literal('steady'),
    Type.Literal('decreasing'),
    Type.Literal('increasing')
  ],
  { $id: 'PressureTendency' }
)

/** Precipitation type */
export const PrecipitationTypeSchema = Type.Union(
  [
    Type.Literal('rain'),
    Type.Literal('thunderstorm'),
    Type.Literal('snow'),
    Type.Literal('freezing rain'),
    Type.Literal('mixed/ice')
  ],
  { $id: 'PrecipitationType' }
)

/**
 * Weather data model — observation, daily forecast, or point forecast.
 */
export const WeatherDataModelSchema = Type.Object(
  {
    date: IsoTimeSchema,
    description: Type.Optional(
      Type.String({
        description: 'Weather description',
        examples: ['broken clouds']
      })
    ),
    type: WeatherDataTypeSchema,
    sun: Type.Optional(
      Type.Object({
        sunrise: Type.Optional(IsoTimeSchema),
        sunset: Type.Optional(IsoTimeSchema)
      })
    ),
    outside: Type.Optional(
      Type.Object({
        uvIndex: Type.Optional(
          Type.Number({
            description: 'UV Index (1 UVI = 25mW/sqm)',
            examples: [7.5]
          })
        ),
        cloudCover: Type.Optional(
          Type.Number({
            description: 'Amount of cloud cover (ratio)',
            examples: [0.85]
          })
        ),
        horizontalVisibility: Type.Optional(
          Type.Number({
            description: 'Visibility (m)',
            units: 'm',
            examples: [5000]
          })
        ),
        horizontalVisibilityOverRange: Type.Optional(
          Type.Boolean({
            description:
              'Visibility distance is greater than the range of the measuring equipment'
          })
        ),
        temperature: Type.Optional(
          Type.Number({
            description: 'Air temperature (K)',
            units: 'K',
            examples: [290]
          })
        ),
        feelsLikeTemperature: Type.Optional(
          Type.Number({
            description: 'Feels-like temperature (K)',
            units: 'K',
            examples: [277]
          })
        ),
        dewPointTemperature: Type.Optional(
          Type.Number({
            description: 'Dew point temperature (K)',
            units: 'K',
            examples: [260]
          })
        ),
        pressure: Type.Optional(
          Type.Number({
            description: 'Air pressure (Pa)',
            units: 'Pa',
            examples: [10100]
          })
        ),
        pressureTendency: Type.Optional(PressureTendencySchema),
        absoluteHumidity: Type.Optional(
          Type.Number({
            description: 'Absolute humidity (ratio)',
            examples: [0.56]
          })
        ),
        relativeHumidity: Type.Optional(
          Type.Number({
            description: 'Relative humidity (ratio)',
            examples: [0.56]
          })
        ),
        precipitationType: Type.Optional(PrecipitationTypeSchema),
        precipitationVolume: Type.Optional(
          Type.Number({
            description: 'Amount of precipitation (m)',
            units: 'm',
            examples: [0.56]
          })
        )
      })
    ),
    wind: Type.Optional(
      Type.Object({
        averageSpeed: Type.Optional(
          Type.Number({
            description: 'Average wind speed (m/s)',
            units: 'm/s',
            examples: [9.3]
          })
        ),
        speedTrue: Type.Optional(
          Type.Number({
            description: 'Wind speed (m/s)',
            units: 'm/s',
            examples: [15.3]
          })
        ),
        directionTrue: Type.Optional(
          Type.Number({
            description: 'Wind direction relative to true north (rad)',
            units: 'rad',
            examples: [2.145]
          })
        ),
        gust: Type.Optional(
          Type.Number({
            description: 'Wind gust (m/s)',
            units: 'm/s',
            examples: [21.6]
          })
        ),
        gustDirectionTrue: Type.Optional(
          Type.Number({
            description: 'Wind gust direction relative to true north (rad)',
            units: 'rad',
            examples: [2.6]
          })
        )
      })
    ),
    water: Type.Optional(
      Type.Object({
        temperature: Type.Optional(
          Type.Number({
            description: 'Water temperature (K)',
            units: 'K',
            examples: [281.6]
          })
        ),
        level: Type.Optional(
          Type.Number({
            description: 'Water level (m)',
            units: 'm',
            examples: [11.9]
          })
        ),
        levelTendency: Type.Optional(
          Type.Union([
            Type.Literal('steady'),
            Type.Literal('decreasing'),
            Type.Literal('increasing')
          ])
        ),
        waves: Type.Optional(
          Type.Object({
            significantHeight: Type.Optional(
              Type.Number({
                description: 'Wave height (m)',
                units: 'm',
                examples: [2.6]
              })
            ),
            directionTrue: Type.Optional(
              Type.Number({
                description: 'Wave direction relative to true north (rad)',
                units: 'rad',
                examples: [2.3876]
              })
            ),
            period: Type.Optional(
              Type.Number({
                description: 'Wave period (s)',
                units: 's',
                examples: [2.3876]
              })
            )
          })
        ),
        swell: Type.Optional(
          Type.Object({
            height: Type.Optional(
              Type.Number({
                description: 'Swell height (m)',
                units: 'm',
                examples: [2.6]
              })
            ),
            directionTrue: Type.Optional(
              Type.Number({
                description: 'Swell direction relative to true north (rad)',
                units: 'rad',
                examples: [2.3876]
              })
            ),
            period: Type.Optional(
              Type.Number({
                description: 'Swell period (s)',
                units: 's',
                examples: [2.3876]
              })
            )
          })
        ),
        seaState: Type.Optional(
          Type.Number({ description: 'Sea state (Beaufort)', examples: [2] })
        ),
        salinity: Type.Optional(
          Type.Number({
            description: 'Water salinity (ratio)',
            examples: [0.12]
          })
        ),
        ice: Type.Optional(
          Type.Boolean({ description: 'Whether ice is present' })
        )
      })
    ),
    current: Type.Optional(
      Type.Object({
        drift: Type.Optional(
          Type.Number({
            description: 'Surface current speed (m/s)',
            units: 'm/s',
            examples: [3.4]
          })
        ),
        set: Type.Optional(
          Type.Number({
            description: 'Surface current direction (rad)',
            units: 'rad',
            examples: [1.74]
          })
        )
      })
    )
  },
  {
    $id: 'WeatherDataModel',
    description: 'Weather data — observation, daily forecast, or point forecast'
  }
)
export type WeatherDataModel = Static<typeof WeatherDataModelSchema>

// ---------------------------------------------------------------------------
// Weather warning model
// ---------------------------------------------------------------------------

/**
 * Weather warning — time-bound severe weather advisory.
 */
export const WeatherWarningModelSchema = Type.Object(
  {
    startTime: IsoTimeSchema,
    endTime: IsoTimeSchema,
    source: Type.Optional(Type.String({ description: 'Name of source.' })),
    type: Type.Optional(
      Type.String({
        description: 'Type of warning.',
        examples: ['Heat Advisory']
      })
    ),
    details: Type.Optional(
      Type.String({
        description: 'Text describing the details of the warning.',
        examples: [
          'HEAT ADVISORY REMAINS IN EFFECT FROM 1 PM THIS AFTERNOON....'
        ]
      })
    )
  },
  {
    $id: 'WeatherWarningModel',
    description: 'Weather warning — time-bound severe weather advisory'
  }
)
export type WeatherWarningModel = Static<typeof WeatherWarningModelSchema>
