import type { PathMetadataEntry } from './types'

export const environmentMetadata: Record<string, PathMetadataEntry> = {
  '/vessels/*/environment': {
    description:
      'Environmental data measured locally including Depth, Wind, Temp, etc.'
  },
  '/vessels/*/environment/outside': {
    description: "Environmental conditions outside of the vessel's hull"
  },
  '/vessels/*/environment/outside/temperature': {
    description: 'Current outside air temperature',
    units: 'K'
  },
  '/vessels/*/environment/outside/dewPointTemperature': {
    description: 'Current outside dew point temperature',
    units: 'K'
  },
  '/vessels/*/environment/outside/apparentWindChillTemperature': {
    description: 'Current outside apparent wind chill temperature',
    units: 'K'
  },
  '/vessels/*/environment/outside/theoreticalWindChillTemperature': {
    description: 'Current outside theoretical wind chill temperature',
    units: 'K'
  },
  '/vessels/*/environment/outside/heatIndexTemperature': {
    description: 'Current outside heat index temperature',
    units: 'K'
  },
  '/vessels/*/environment/outside/pressure': {
    description: 'Current outside air ambient pressure',
    units: 'Pa'
  },
  '/vessels/*/environment/outside/humidity': {
    description: 'DEPRECATED: use relativeHumidity',
    units: 'ratio'
  },
  '/vessels/*/environment/outside/relativeHumidity': {
    description: 'Current outside air relative humidity',
    units: 'ratio'
  },
  '/vessels/*/environment/outside/airDensity': {
    description: 'Current outside air density',
    units: 'kg/m3'
  },
  '/vessels/*/environment/outside/illuminance': {
    description: 'Current outside ambient light flux.',
    units: 'Lux'
  },
  '/vessels/*/environment/inside': {
    description: "Environmental conditions inside the vessel's hull"
  },
  '/vessels/*/environment/inside/temperature': {
    description: 'Temperature',
    units: 'K'
  },
  '/vessels/*/environment/inside/heatIndexTemperature': {
    description: 'Current heat index temperature in zone',
    units: 'K'
  },
  '/vessels/*/environment/inside/pressure': {
    description: 'Pressure in zone',
    units: 'Pa'
  },
  '/vessels/*/environment/inside/relativeHumidity': {
    description: 'Relative humidity in zone',
    units: 'ratio'
  },
  '/vessels/*/environment/inside/dewPoint': {
    description: 'DEPRECATED: use dewPointTemperature',
    units: 'K'
  },
  '/vessels/*/environment/inside/dewPointTemperature': {
    description: 'Dewpoint in zone',
    units: 'K'
  },
  '/vessels/*/environment/inside/airDensity': {
    description: 'Air density in zone',
    units: 'kg/m3'
  },
  '/vessels/*/environment/inside/illuminance': {
    description: 'Illuminance in zone',
    units: 'Lux'
  },
  '/vessels/*/environment/inside/[A-Za-z0-9]+': {
    description:
      'This regex pattern is used for validation of the identifier for the environmental zone, eg. engineRoom, mainCabin, refrigerator'
  },
  '/vessels/*/environment/inside/[A-Za-z0-9]+/temperature': {
    description: 'Temperature',
    units: 'K'
  },
  '/vessels/*/environment/inside/[A-Za-z0-9]+/heatIndexTemperature': {
    description: 'Current heat index temperature in zone',
    units: 'K'
  },
  '/vessels/*/environment/inside/[A-Za-z0-9]+/pressure': {
    description: 'Pressure in zone',
    units: 'Pa'
  },
  '/vessels/*/environment/inside/[A-Za-z0-9]+/relativeHumidity': {
    description: 'Relative humidity in zone',
    units: 'ratio'
  },
  '/vessels/*/environment/inside/[A-Za-z0-9]+/dewPoint': {
    description: 'DEPRECATED: use dewPointTemperature',
    units: 'K'
  },
  '/vessels/*/environment/inside/[A-Za-z0-9]+/dewPointTemperature': {
    description: 'Dewpoint in zone',
    units: 'K'
  },
  '/vessels/*/environment/inside/[A-Za-z0-9]+/airDensity': {
    description: 'Air density in zone',
    units: 'kg/m3'
  },
  '/vessels/*/environment/inside/[A-Za-z0-9]+/illuminance': {
    description: 'Illuminance in zone',
    units: 'Lux'
  },
  '/vessels/*/environment/water': {
    description:
      'Environmental conditions of the water that the vessel is sailing in'
  },
  '/vessels/*/environment/water/temperature': {
    description: 'Current water temperature',
    units: 'K'
  },
  '/vessels/*/environment/water/salinity': {
    description: 'Water salinity',
    units: 'ratio'
  },
  '/vessels/*/environment/depth': {
    description: 'Depth related data'
  },
  '/vessels/*/environment/depth/belowKeel': {
    description: 'Depth below keel',
    units: 'm'
  },
  '/vessels/*/environment/depth/belowTransducer': {
    description: 'Depth below Transducer',
    units: 'm'
  },
  '/vessels/*/environment/depth/belowSurface': {
    description: 'Depth from surface',
    units: 'm'
  },
  '/vessels/*/environment/depth/transducerToKeel': {
    description: 'Depth from the transducer to the bottom of the keel',
    units: 'm'
  },
  '/vessels/*/environment/depth/surfaceToTransducer': {
    description: 'Depth transducer is below the water surface',
    units: 'm'
  },
  '/vessels/*/environment/current': {
    description: 'Direction and strength of current affecting the vessel',
    properties: {
      drift: {
        type: 'number',
        description: 'The speed component of the water current vector',
        example: 3.12,
        units: 'm/s'
      },
      setTrue: {
        type: 'number',
        description:
          'The direction component of the water current vector referenced to true (geographic) north',
        example: 123.45,
        units: 'rad'
      },
      setMagnetic: {
        type: 'number',
        description:
          'The direction component of the water current vector referenced to magnetic north',
        example: 131.22,
        units: 'rad'
      }
    }
  },
  '/vessels/*/environment/tide': {
    description: 'Tide data'
  },
  '/vessels/*/environment/tide/heightHigh': {
    description:
      'Next high tide height  relative to lowest astronomical tide (LAT/Chart Datum)',
    units: 'm'
  },
  '/vessels/*/environment/tide/heightNow': {
    description:
      'The current tide height  relative to lowest astronomical tide (LAT/Chart Datum)',
    units: 'm'
  },
  '/vessels/*/environment/tide/heightLow': {
    description:
      'The next low tide height relative to lowest astronomical tide (LAT/Chart Datum)',
    units: 'm'
  },
  '/vessels/*/environment/tide/timeLow': {
    description:
      'RFC 3339 (UTC only without local offset) string representing date and time.',
    units: 'RFC 3339 (UTC)'
  },
  '/vessels/*/environment/tide/timeHigh': {
    description:
      'RFC 3339 (UTC only without local offset) string representing date and time.',
    units: 'RFC 3339 (UTC)'
  },
  '/vessels/*/environment/heave': {
    description: 'Vertical movement of the vessel due to waves',
    units: 'm'
  },
  '/vessels/*/environment/wind': {
    description: 'Wind data.'
  },
  '/vessels/*/environment/wind/angleApparent': {
    description: 'Apparent wind angle, negative to port',
    units: 'rad'
  },
  '/vessels/*/environment/wind/angleTrueGround': {
    description: 'True wind angle based on speed over ground, negative to port',
    units: 'rad'
  },
  '/vessels/*/environment/wind/angleTrueWater': {
    description:
      'True wind angle based on speed through water, negative to port',
    units: 'rad'
  },
  '/vessels/*/environment/wind/directionChangeAlarm': {
    description: 'The angle the wind needs to shift to raise an alarm',
    units: 'rad'
  },
  '/vessels/*/environment/wind/directionTrue': {
    description: 'The wind direction relative to true north',
    units: 'rad'
  },
  '/vessels/*/environment/wind/directionMagnetic': {
    description: 'The wind direction relative to magnetic north',
    units: 'rad'
  },
  '/vessels/*/environment/wind/speedTrue': {
    description:
      "Wind speed over water (as calculated from speedApparent and vessel's speed through water)",
    units: 'm/s'
  },
  '/vessels/*/environment/wind/speedOverGround': {
    description:
      "Wind speed over ground (as calculated from speedApparent and vessel's speed over ground)",
    units: 'm/s'
  },
  '/vessels/*/environment/wind/speedApparent': {
    description: 'Apparent wind speed',
    units: 'm/s'
  },
  '/vessels/*/environment/time': {
    description:
      'A time reference for the vessel. All clocks on the vessel dispaying local time should use the timezone offset here. If a timezoneRegion is supplied the timezone must also be supplied. If timezoneRegion is supplied that should be displayed by UIs in preference to simply timezone. ie 12:05 (Europe/London) should be displayed in preference to 12:05 (UTC+01:00)'
  },
  '/vessels/*/environment/time/millis': {
    description: 'Milliseconds since the UNIX epoch (1970-01-01 00:00:00)'
  },
  '/vessels/*/environment/time/timezoneOffset': {
    description:
      'Onboard timezone offset from UTC in hours and minutes (-)hhmm. +ve means east of Greenwich. For use by UIs'
  },
  '/vessels/*/environment/time/timezoneRegion': {
    description:
      'Onboard timezone offset as listed in the IANA timezone database (tz database)'
  },
  '/vessels/*/environment/mode': {
    description:
      'Mode of the vessel based on the current conditions. Can be combined with navigation.state to control vessel signals eg switch to night mode for instrumentation and lights, or make sound signals for fog.'
  }
}
