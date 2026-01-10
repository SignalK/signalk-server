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
 * These are curated sets of plugins that work well together.
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
      }
    ],
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
        name: '@signalk/freeboard-sk',
        required: true,
        setAsLandingPage: true,
        description: 'Full-featured chart plotter and navigation display'
      },
      {
        name: 'signalk-charts-provider-simple',
        required: false,
        description: 'Simple chart provider for local chart files'
      },
      {
        name: '@signalk/charts-plugin',
        required: false,
        description: 'Mapbox tiles chart provider'
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
        name: 'signalk-buddylist-plugin',
        required: false,
        description: 'Track and display buddy vessels'
      }
    ],
    order: 2
  },
  {
    id: 'dashboard',
    name: 'Dashboard & Instruments',
    description:
      'KIP instrument panel with gauges and real-time data visualization. Great for helm displays and monitoring.',
    icon: 'dashboard',
    plugins: [
      {
        name: '@mxtommy/kip',
        required: true,
        setAsLandingPage: true,
        description: 'Modern, customizable instrument display'
      }
    ],
    order: 3
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
      }
    ],
    order: 4
  },
  {
    id: 'bluetooth',
    name: 'Bluetooth Sensors',
    description:
      'Bluetooth sensor integration for Victron, Renogy, Xiaomi and other BLE devices.',
    icon: 'bluetooth',
    plugins: [
      {
        name: 'bt-sensors-plugin-sk',
        required: true,
        description:
          'Bluetooth sensor integration for Victron, Renogy, Xiaomi and others'
      }
    ],
    order: 5
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
      }
    ],
    order: 6
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
