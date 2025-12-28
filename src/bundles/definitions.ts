/*
 * Copyright 2024 Signal K
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { BundleDefinition } from './types'

/**
 * Predefined bundles for common Signal K use cases.
 * These are curated sets of plugins and webapps that work well together.
 */
export const BUNDLE_DEFINITIONS: BundleDefinition[] = [
  {
    id: 'minimal',
    name: 'Minimal',
    description:
      'Basic Signal K server with no additional plugins or webapps. Ideal for custom setups or resource-constrained devices.',
    icon: 'minimize',
    plugins: [],
    webapps: [],
    order: 1
  },
  {
    id: 'plotter',
    name: 'Plotter & Navigation',
    description:
      'Chart display, route planning, waypoints, and navigation features. Perfect for chart plotters and navigation displays.',
    icon: 'map',
    plugins: [
      {
        name: '@signalk/charts-plugin',
        required: true,
        description: 'Serves chart tiles to chart plotting apps'
      },
      {
        name: '@signalk/resources-provider',
        required: true,
        description: 'Stores and serves routes, waypoints, regions, and notes'
      },
      {
        name: '@signalk/course-provider',
        required: true,
        description: 'Provides course calculations and destination tracking'
      },
      {
        name: '@signalk/vesselpositions',
        required: false,
        description: 'Displays nearby vessels from AIS data on the chart'
      },
      {
        name: '@signalk/tracks-plugin',
        required: false,
        description: 'Records vessel track history'
      },
      {
        name: '@signalk/simple-gpx',
        required: false,
        description: 'Import and export GPX files'
      }
    ],
    webapps: [
      {
        name: '@signalk/freeboard-sk',
        setAsLandingPage: true,
        description: 'Full-featured chart plotter and navigation display'
      }
    ],
    order: 2
  },
  {
    id: 'dashboard',
    name: 'Dashboard & Instruments',
    description:
      'Instrument panels, gauges, and real-time data visualization. Great for helm displays and monitoring.',
    icon: 'dashboard',
    plugins: [
      {
        name: 'signalk-derived-data',
        required: false,
        description: 'Calculates derived values like true wind, VMG, etc.'
      },
      {
        name: '@signalk/zones',
        required: false,
        description: 'Configures alert zones for values'
      },
      {
        name: 'signalk-speed-wind-averaging',
        required: false,
        description: 'Provides smoothed speed and wind readings'
      }
    ],
    webapps: [
      {
        name: '@signalk/instrumentpanel',
        setAsLandingPage: true,
        description: 'Customizable instrument panel with gauges and displays'
      },
      {
        name: '@mxtommy/kip',
        description: 'Modern, customizable instrument display'
      },
      {
        name: '@signalk/sailgauge',
        description: 'Sailing-focused wind and performance gauges'
      }
    ],
    order: 3
  },
  {
    id: 'datalogger',
    name: 'Data Logger',
    description:
      'Record and analyze historical data. Useful for performance analysis, maintenance tracking, and voyage logs.',
    icon: 'storage',
    plugins: [
      {
        name: 'signalk-to-influxdb2',
        required: true,
        description: 'Logs Signal K data to InfluxDB for analysis'
      },
      {
        name: '@signalk/tracks-plugin',
        required: false,
        description: 'Records vessel track history'
      }
    ],
    webapps: [
      {
        name: '@signalk/instrumentpanel',
        description: 'View current data while logging'
      }
    ],
    order: 4
  },
  {
    id: 'anchor',
    name: 'Anchor Watch',
    description:
      'Anchor alarm and monitoring features. Get alerts when your vessel moves outside a defined area.',
    icon: 'anchor',
    plugins: [
      {
        name: 'signalk-anchoralarm-plugin',
        required: true,
        description: 'Monitors anchor position and triggers alarms'
      },
      {
        name: 'signalk-push-notifications',
        required: false,
        description: 'Sends push notifications to mobile devices'
      },
      {
        name: 'signalk-alarm-silencer',
        required: false,
        description: 'Provides UI to acknowledge and silence alarms'
      },
      {
        name: '@signalk/tracks-plugin',
        required: false,
        description: 'Records vessel movement for review'
      }
    ],
    webapps: [
      {
        name: '@signalk/freeboard-sk',
        setAsLandingPage: true,
        description: 'View anchor position on chart'
      }
    ],
    order: 5
  },
  {
    id: 'nmea',
    name: 'NMEA Integration',
    description:
      'Plugins for connecting to NMEA 0183 and NMEA 2000 networks. Essential for integrating with existing marine electronics.',
    icon: 'link',
    plugins: [
      {
        name: '@signalk/signalk-to-nmea0183',
        required: false,
        description: 'Outputs Signal K data as NMEA 0183 sentences'
      },
      {
        name: '@signalk/udp-nmea-plugin',
        required: false,
        description: 'Receives NMEA data over UDP network'
      },
      {
        name: 'signalk-to-nmea2000',
        required: false,
        description: 'Outputs Signal K data to NMEA 2000 network'
      },
      {
        name: 'signalk-n2kais-to-nmea0183',
        required: false,
        description: 'Converts NMEA 2000 AIS messages to NMEA 0183'
      },
      {
        name: '@signalk/set-system-time',
        required: false,
        description: 'Sets system time from GPS data'
      }
    ],
    webapps: [],
    order: 6
  },
  {
    id: 'full',
    name: 'Full Featured',
    description:
      'Complete installation with navigation, instruments, and logging. Best for powerful devices with plenty of storage.',
    icon: 'stars',
    plugins: [
      // Navigation
      {
        name: '@signalk/charts-plugin',
        required: true,
        description: 'Serves chart tiles'
      },
      {
        name: '@signalk/resources-provider',
        required: true,
        description: 'Routes, waypoints, regions'
      },
      {
        name: '@signalk/course-provider',
        required: true,
        description: 'Course calculations'
      },
      {
        name: '@signalk/vesselpositions',
        required: false,
        description: 'Nearby vessel display'
      },
      {
        name: '@signalk/tracks-plugin',
        required: false,
        description: 'Track recording'
      },
      // Instruments
      {
        name: 'signalk-derived-data',
        required: false,
        description: 'Derived calculations'
      },
      {
        name: '@signalk/zones',
        required: false,
        description: 'Value alert zones'
      },
      // Anchor
      {
        name: 'signalk-anchoralarm-plugin',
        required: false,
        description: 'Anchor monitoring'
      },
      // NMEA integration
      {
        name: '@signalk/signalk-to-nmea0183',
        required: false,
        description: 'NMEA 0183 output'
      },
      {
        name: 'signalk-to-nmea2000',
        required: false,
        description: 'NMEA 2000 output'
      },
      // Utility
      {
        name: '@signalk/simple-gpx',
        required: false,
        description: 'GPX import/export'
      },
      {
        name: '@signalk/set-system-time',
        required: false,
        description: 'GPS time sync'
      }
    ],
    webapps: [
      {
        name: '@signalk/freeboard-sk',
        setAsLandingPage: true,
        description: 'Chart plotter'
      },
      {
        name: '@signalk/instrumentpanel',
        description: 'Instrument gauges'
      },
      {
        name: '@mxtommy/kip',
        description: 'Modern instruments'
      }
    ],
    order: 7
  }
]

/**
 * Get all available bundle definitions
 */
export function getBundleDefinitions(): BundleDefinition[] {
  return BUNDLE_DEFINITIONS.slice().sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
}

/**
 * Get a specific bundle by ID
 */
export function getBundleById(id: string): BundleDefinition | undefined {
  return BUNDLE_DEFINITIONS.find((bundle) => bundle.id === id)
}
