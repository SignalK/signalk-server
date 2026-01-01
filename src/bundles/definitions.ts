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
    id: 'admin',
    name: 'Administration',
    description:
      'Essential server administration tools. Log viewer and system time synchronization from GPS.',
    icon: 'cog',
    plugins: [
      {
        name: 'signalk-logviewer',
        required: true,
        description: 'View Signal K server logs'
      },
      {
        name: '@signalk/set-system-time',
        required: true,
        description: 'Sets system time from GPS data'
      },
      {
        name: 'signalk-rpi-monitor',
        required: false,
        description:
          'Raspberry Pi CPU, memory, storage and temperature monitoring'
      },
      {
        name: 'signalk-starlink',
        required: false,
        description: 'Starlink Dishy statistics and auto-stow while in transit'
      }
    ],
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
        name: 'signalk-charts-provider-simple',
        required: false,
        description: 'Simple chart provider for local chart files'
      },
      {
        name: 'signalk-pmtiles-plugin',
        required: false,
        description: 'ProtoMaps chart provider'
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
        name: '@signalk/signalk-autopilot',
        required: false,
        description: 'Autopilot control interface'
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
        name: 'signalk-anchoralarm-plugin',
        required: false,
        description: 'Monitors anchor position and triggers alarms'
      },
      {
        name: 'signalk-simple-notifications',
        required: false,
        description: 'Depth alarm notifications'
      },
      {
        name: 'signalk-flags',
        required: false,
        description: 'Displays country flags for vessels'
      },
      {
        name: 'signalk-activecaptain-resources',
        required: false,
        description: 'ActiveCaptain POI data integration'
      },
      {
        name: 'signalk-buddylist-plugin',
        required: false,
        description: 'Track and display buddy vessels'
      },
      {
        name: 'signalk-to-influxdb2',
        required: false,
        description: 'History API for playback and data logging'
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
      },
      {
        name: 'bt-sensors-plugin-sk',
        required: false,
        description:
          'Bluetooth sensor integration for Victron, Renogy, Xiaomi and others'
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
    order: 5
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
        name: 'signalk-engine-hours',
        required: false,
        description: 'Track engine running hours'
      },
      {
        name: 'signalk-to-mongodb',
        required: false,
        description: 'Store Signal K data in MongoDB'
      },
      {
        name: 'signalk-postgsail',
        required: false,
        description: 'Automatic voyage logging to PostgSail cloud'
      },
      {
        name: 'signalk-to-batch-format',
        required: false,
        description: 'Compressed batch JSON files for cloud storage'
      },
      {
        name: 'signalk-path-mapper',
        required: false,
        description: 'Remap data paths for logging compatibility'
      }
    ],
    webapps: [],
    order: 9
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
        name: 'hoekens-anchor-alarm',
        required: false,
        description:
          'Web app anchor alarm with scope calculator and engine override'
      },
      {
        name: 'signalk-tides',
        required: false,
        description: 'Provides tide data for scope calculations'
      },
      {
        name: '@meri-imperiumi/signalk-autostate',
        required: false,
        description: 'Auto-detect anchored vs moored state'
      }
    ],
    webapps: [
      {
        name: '@signalk/freeboard-sk',
        setAsLandingPage: true,
        description: 'View anchor position on chart'
      }
    ],
    order: 6
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
        name: '@canboat/visual-analyzer',
        required: false,
        description: 'NMEA 2000 data visualization and analysis tool'
      },
      {
        name: 'signalk-n2k-switching',
        required: false,
        description: 'Control NMEA 2000 switching devices'
      },
      {
        name: 'signalk-maretron-proprietary',
        required: false,
        description: 'Support for Maretron proprietary PGNs'
      }
    ],
    webapps: [],
    order: 3
  },
  {
    id: 'ais',
    name: 'AIS & Vessel Tracking',
    description:
      'AIS data processing, vessel tracking, collision avoidance, and reporting to services like MarineTraffic.',
    icon: 'ship',
    plugins: [
      {
        name: '@signalk/vesselpositions',
        required: true,
        description: 'Displays nearby vessels from AIS data'
      },
      {
        name: 'ais-forwarder',
        required: false,
        description: 'Forward AIS data to MarineTraffic, AISHub and others'
      },
      {
        name: '@signalk/aisreporter',
        required: false,
        description:
          'Report vessel position to MarineTraffic without AIS hardware'
      },
      {
        name: 'signalk-n2kais-to-nmea0183',
        required: false,
        description: 'Convert NMEA 2000 AIS to NMEA 0183 format'
      },
      {
        name: 'signalk-vessels-to-ais',
        required: false,
        description: 'Convert vessel data to NMEA 0183 AIS format'
      },
      {
        name: 'signalk-ais-target-prioritizer',
        required: false,
        description: 'CPA/TCPA collision risk warnings and alarms'
      },
      {
        name: '@noforeignland/signalk-to-noforeignland',
        required: false,
        description: 'Upload tracks and logs to NoForeignLand'
      },
      {
        name: 'signalk-saillogger',
        required: false,
        description: 'Automated sailing log entries'
      },
      {
        name: 'naivegpxlogger',
        required: false,
        description: 'Simple GPX track logging'
      },
      {
        name: 'signalk-windy',
        required: false,
        description: 'Send data to Windy.com weather service'
      },
      {
        name: 'signalk-derived-data',
        required: false,
        description: 'Calculates derived values required by signalk-windy'
      }
    ],
    webapps: [],
    order: 4
  },
  {
    id: 'wilhelmsk',
    name: 'WilhelmSK Mobile',
    description:
      'iOS/mobile app integration with push notifications and remote monitoring.',
    icon: 'mobile',
    plugins: [
      {
        name: 'signalk-wilhelmsk-plugin',
        required: true,
        description: 'Special functionality for WilhelmSK app'
      },
      {
        name: 'signalk-push-notifications',
        required: true,
        description: 'Sends push notifications to mobile devices'
      },
      {
        name: 'signalk-alarm-silencer',
        required: false,
        description: 'Acknowledge and silence alarms from WilhelmSK'
      },
      {
        name: '@signalk/zones',
        required: false,
        description: 'Configure alert zones for values'
      },
      {
        name: 'signalk-anchoralarm-plugin',
        required: false,
        description: 'Anchor monitoring with mobile alerts'
      },
      {
        name: 'signalk-raymarine-autopilot',
        required: false,
        description: 'Raymarine autopilot control from WilhelmSK'
      },
      {
        name: 'signalk-fusion-stereo',
        required: false,
        description: 'Fusion stereo control from WilhelmSK'
      }
    ],
    webapps: [],
    order: 7
  },
  {
    id: 'automation',
    name: 'Home Automation',
    description:
      'Node-RED, MQTT, and smart home integration for vessel automation.',
    icon: 'workflow',
    plugins: [
      {
        name: '@signalk/signalk-node-red',
        required: true,
        description: 'Node-RED integration for flow-based automation'
      },
      {
        name: 'signalk-mqtt-gw',
        required: false,
        description: 'MQTT gateway for Home Assistant and other systems'
      },
      {
        name: 'signalk-shelly2',
        required: false,
        description: 'Shelly smart device integration'
      },
      {
        name: 'signalk-philips-hue',
        required: false,
        description: 'Philips Hue smart lighting control'
      }
    ],
    webapps: [],
    order: 8
  }
]

/**
 * Get all available bundle definitions
 */
export function getBundleDefinitions(): BundleDefinition[] {
  return BUNDLE_DEFINITIONS.slice().sort(
    (a, b) => (a.order ?? 99) - (b.order ?? 99)
  )
}

/**
 * Get a specific bundle by ID
 */
export function getBundleById(id: string): BundleDefinition | undefined {
  return BUNDLE_DEFINITIONS.find((bundle) => bundle.id === id)
}
