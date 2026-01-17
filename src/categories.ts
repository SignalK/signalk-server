/*
 * Copyright 2021 Scott Bender <scott@scottbender.net>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
*/

import { createDebug } from './debug'
const debug = createDebug('signalk:categories')

import { getKeywords, NpmPackageData } from './modules'

const NEW_CATEGORY = 'New/Updated'

const CAT_DEPRECATED = 'signalk-category-deprecated'

const isDeprecated = (packageName: string) =>
  DEFAULT_MODULE_CAT_KEYWORDS[packageName] &&
  DEFAULT_MODULE_CAT_KEYWORDS[packageName].includes(CAT_DEPRECATED)

function getCategories(thePackage: NpmPackageData): string[] {
  if (isDeprecated(thePackage.name)) {
    return ['Deprecated']
  }

  let categoryKeywords: string[] = getKeywords(thePackage).filter(
    (keyword: string) => CAT_KEYWORDS_TO_NAMES[keyword]
  )
  if (categoryKeywords.length === 0) {
    categoryKeywords = categoryKeywords.concat(
      DEFAULT_MODULE_CAT_KEYWORDS[thePackage.name] || []
    )
  }
  const categoryNames = categoryKeywords.map(
    (category) => CAT_KEYWORDS_TO_NAMES[category]
  )

  if (categoryNames.length === 0) {
    categoryNames.push('Uncategorized')
  }

  if (thePackage.date) {
    const pDate = new Date(thePackage.date)
    if ((Date.now() - pDate.getTime()) / (1000 * 3600 * 24) < 30) {
      // updated less than 30 days ago
      categoryNames.push(NEW_CATEGORY)
    }
  }

  debug('%s categories: %j', thePackage.name, categoryNames)
  return categoryNames
}

function getAvailableCategories() {
  const normal = Object.values(CAT_KEYWORDS_TO_NAMES).slice(0).sort()

  return ['All', ...normal]
}

const CAT_KEYWORDS_TO_NAMES: {
  [keyword: string]: string
} = {
  'signalk-category-nmea-2000': 'NMEA 2000',
  'signalk-category-nmea-0183': 'NMEA 0183',
  'signalk-category-instruments': 'Instruments',
  'signalk-category-chart-plotters': 'Chart Plotters',
  'signalk-category-hardware': 'Hardware Support',
  'signalk-category-ais': 'AIS',
  'signalk-category-notifications': 'Notifications',
  'signalk-category-digital-switching': 'Digital Switching',
  'signalk-category-utility': 'Utility',
  'signalk-category-cloud': 'Cloud',
  'signalk-category-weather': 'Weather'
}

const DEFAULT_MODULE_CAT_KEYWORDS: {
  [key: string]: string[]
} = {
  '@signalk/vedirect-serial-usb': ['signalk-category-hardware'],
  '@signalk/signalk-to-nmea0183': ['signalk-category-nmea-0183'],
  '@meri-imperiumi/signalk-aws-iot': ['signalk-category-cloud'],
  'signalk-barometer-trend': ['signalk-category-weather'],
  '@signalk/calibration': ['signalk-category-utility'],
  'signalk-log-player': ['signalk-category-utility'],
  'signalk-calypso-ultrasonic': ['signalk-category-hardware'],
  'signalk-venus-plugin': ['signalk-category-hardware'],
  'signalk-to-nmea2000': ['signalk-category-nmea-2000'],
  'signalk-boatly': ['signalk-category-cloud'],
  '@signalk/charts-plugin': ['signalk-category-chart-plotters'],
  'signalk-derived-data': ['signalk-category-utility'],
  '@meri-imperiumi/signalk-autostate': ['signalk-category-utility'],
  'signalk-empirbusnxt-plugin': ['signalk-category-hardware'],
  '@signalk/set-system-time': ['signalk-category-utility'],
  'signalk-instrument-light-plugin': [
    'signalk-category-hardware',
    'signalk-category-utility'
  ],
  'signalk-vessels-to-ais': ['signalk-category-ais'],
  'signalk-sonoff-ewelink': [
    'signalk-category-hardware',
    'signalk-category-digital-switching'
  ],
  'signalk-n2k-switching': [
    'signalk-category-nmea-2000',
    'signalk-category-digital-switching'
  ],
  '@signalk/tracks-plugin': ['signalk-category-utility'],
  'signalk-browser': ['signalk-category-web-instruments'],
  '@signalk/signalk-autopilot': ['signalk-category-hardware'],
  'signalk-tides-api': ['signalk-category-weather'],
  'sailracer-signalk-plugin': ['signalk-category-utility'],
  'signalk-n2k-virtual-switch': [
    'signalk-category-digital-switching',
    'signalk-category-nmea-2000'
  ],
  'signalk-net-ais-plugin': ['signalk-category-ais'],
  'signalk-shelly': [
    'signalk-category-hardware',
    'signalk-category-digital-switching'
  ],
  'signalk-noaa-weather': ['signalk-category-weather'],
  'signalk-scheduler': ['signalk-category-utility'],
  'signalk-renotifier': ['signalk-category-notifications'],
  sksim: ['signalk-category-utility'],
  'signalk-raspberry-pi-bme280': [
    'signalk-category-hardware',
    'signalk-category-weather'
  ],
  'signalk-generic-pgn-parser': ['signalk-category-nmea-2000'],
  '@signalk/signalk-node-red': ['signalk-category-utility'],
  'signalk-philips-hue': [
    'signalk-category-hardware',
    'signalk-category-digital-switching'
  ],
  'signalk-anchoralarm-plugin': ['signalk-category-notifications'],
  'signalk-raspberry-mcs': ['signalk-category-hardware'],
  'signalk-hour-meter': ['signalk-category-utility'],
  'signalk-tide-watch': ['signalk-category-weather'],
  '@signalk/udp-nmea-plugin': ['signalk-category-nmea-0183'],
  'signalk-to-batch-format': ['signalk-category-utility'],
  'signalk-to-influxdb': ['signalk-category-utility'],
  'signalk-to-timestream': ['signalk-category-cloud'],
  'signalk-from-batch-format': ['signalk-category-utility'],
  'signalk-sunphases': ['signalk-category-weather'],
  '@codekilo/regexp-jexl-reader': ['signalk-category-nmea-0183'],
  'signalk-speed-wind-averaging': ['signalk-category-weather'],
  '@codekilo/nmea0183-iec61121-450-server': ['signalk-category-nmea-0183'],
  'signalk-push-notifications': ['signalk-category-notifications'],
  '@meri-imperiumi/signalk-audio-notifications': [
    'signalk-category-notifications'
  ],
  'signalk-netgear-lte-status': ['signalk-category-hardware'],
  'freeboard-sk-helper': ['signalk-category-chart-plotters'],
  'sk-resources-fs': [
    'signalk-category-utility',
    'signalk-category-chart-plotters'
  ],
  '@codekilo/signalk-modbus-client': ['signalk-category-utility'],
  'signalk-path-mapper': ['signalk-category-utility'],
  '@oehoe83/signalk-raspberry-pi-bme680': [
    'signalk-category-hardware',
    'signalk-category-weather'
  ],
  '@codekilo/signalk-twilio-notifications': ['signalk-category-notifications'],
  'signalk-notification-injector': ['signalk-category-notifications'],
  'signalk-alarm-silencer': ['signalk-category-notifications'],
  'signalk-cloud': ['signalk-category-cloud'],
  'signalk-mqtt-gw': ['signalk-category-utility'],
  '@signalk/aisreporter': ['signalk-category-ais'],
  'signalk-polar': ['signalk-category-utility'],
  'openweather-signalk': ['signalk-category-weather'],
  'rest-provider-signalk': ['signalk-category-utility'],
  '@signalk/zones': ['signalk-category-notifications'],
  'signalk-ecowitt': ['signalk-category-hardware', 'signalk-category-weather'],
  'xdr-parser-plugin': ['signalk-category-nmea-0183'],
  'signalk-charlotte': ['signalk-category-cloud'],
  '@codekilo/signalk-notify': ['signalk-category-notifications'],
  '@codekilo/signalk-trigger-event': ['signalk-category-notifications'],
  'signalk-windy': ['signalk-category-weather'],
  'signalk-maretron-proprietary': ['signalk-category-nmea-2000'],
  'signalk-healthcheck': ['signalk-category-utility'],
  'signalk-pebble-mydata': ['signalk-category-hardware'],
  'signalk-to-influxdb-v2-buffering': ['signalk-category-utility'],
  'signalk-saillogger': ['signalk-category-cloud'],
  'signalk-fusion-stereo': ['signalk-category-hardware'],
  'signalk-nextion': ['signalk-category-hardware'],
  'signalk-n2kais-to-nmea0183': [
    'signalk-category-nmea-0183',
    'signalk-category-nmea-2000'
  ],
  'signalk-ttn-loramonitor': ['signalk-category-cloud'],
  'signalk-n2k-switching-translator': [
    'signalk-category-digital-switching',
    'signalk-category-nmea-2000'
  ],
  'signalk-mqtt-home-asisstant': ['signalk-category-digital-switching'],
  '@signalk/sailsconfiguration': ['signalk-category-utility'],
  'signalk-triangle-tank-calculator': ['signalk-category-utility'],
  'signalk-polars-kraivio': ['signalk-category-utility'],
  'signalk-iotopen-lynx-gw': ['signalk-category-cloud'],
  '@signalk/simulatorplugin': ['signalk-category-utility'],
  'fuel-usage-calculator': ['signalk-category-utility'],
  'signalk-stainless-lobster-fridge': ['signalk-category-hardware'],
  'signalk-myyachtlive-log': ['signalk-category-cloud'],
  '@marinedevices/signalk-azure-iot': ['signalk-category-cloud'],
  'srne-to-signalk': ['signalk-category-hardware'],
  'signalk-marinetraffic-api': ['signalk-category-ais'],
  '@signalk/simple-gpx': ['signalk-category-utility'],
  '@codekilo/signalk-iso19848': ['signalk-category-nmea-0183'],
  'signalk-yd-alarm-button': [
    'signalk-category-hardware',
    'signalk-category-notifications'
  ],
  'signalk-datadog': ['signalk-category-cloud'],
  'signalk-scientia-kraivio': ['signalk-category-utility'],
  'ais-forwarder': ['signalk-category-ais'],
  'nmea0183-to-nmea0183': ['signalk-category-nmea-0183'],
  'sk-plugin-sigbus-parser': ['signalk-category-hardware'],
  'signalk-kafka-gw': ['signalk-category-utility'],
  'signalk-simple-notifications': ['signalk-category-notifications'],
  'signalk-buddylist-plugin': ['signalk-category-utility'],
  'signalk-raymarine-autopilot': [CAT_DEPRECATED],
  'signalk-sealogs': ['signalk-category-cloud'],
  'flatten-vessel-data': ['signalk-category-utility'],
  'signalk-repl': ['signalk-category-utility'],
  '@meri-imperiumi/signalk-stardate': ['signalk-category-weather'],
  'signalk-wilhelmsk-plugin': ['signalk-category-utility'],
  'signalk-server-shutdown': ['signalk-category-utility'],
  'signalk-ruuvitag-plugin': [
    'signalk-category-hardware',
    'signalk-category-weather'
  ],
  'import-remote-data': ['signalk-category-utility'],
  'signalk-data-logger': ['signalk-category-utility'],
  'signalk-tank-monitor': ['signalk-category-utility'],
  '@essense/simulate-paths': ['signalk-category-utility'],
  'signalk-threshold-notifier': ['signalk-category-notifications'],
  'ca-reports': ['signalk-category-cloud'],
  'signalk-switch-automation': ['signalk-category-digital-switching'],
  'signalk-overboard-notifications': ['signalk-category-notifications'],
  'signalk-net-relay': ['signalk-category-utility'],
  'signalk-airmar-plugin': ['signalk-category-hardware'],
  'signalk-sbd': ['signalk-category-hardware'],
  'signalk-victron-battery-monitor': [CAT_DEPRECATED],
  'signalk-ifttt-notifications': ['signalk-category-notifications'],
  'signalk-raspberry-pi-1wire': ['signalk-category-hardware'],
  '@essense/instrument-config': [],
  'signalk-aishub-ws': ['signalk-category-ais'],
  '@sail-cloud/sail-cloud': ['signalk-category-cloud'],
  'signalk-notifcation-acker': ['signalk-category-notifications'],
  'signalk-path-filter': ['signalk-category-utility'],
  'signalk-fixedstation': ['signalk-category-utility'],
  '@ib236/signalk-prometheus-exporter': ['signalk-category-utility'],
  'signalk-raspberry-pi-monitoring': ['signalk-category-hardware'],
  'signalk-raspberry-pi-temperature': [CAT_DEPRECATED],
  'signalk-windjs-plugin': ['signalk-category-weather'],
  'signalk-windjs': ['signalk-category-weather'],
  'signalk-barograph': ['signalk-category-weather'],
  'eventsource-sk': [],
  'signalk-websocket-provider': ['signalk-category-utility'],
  'signalk-to-arcgis': ['signalk-category-utility'],

  '@signalk/freeboard-sk': ['signalk-category-chart-plotters'],
  '@mxtommy/kip': ['signalk-category-web-instruments'],
  'signalk-stripcharts': ['signalk-category-web-instruments'],
  '@signalk/sailgauge': ['signalk-category-web-instruments'],
  '@signalk/simplegauges': ['signalk-category-web-instruments'],
  'signalk-kindle-display': ['signalk-category-hardware'],
  skwiz: ['signalk-category-utility'],
  '@signalk/instrumentpanel': ['signalk-category-web-instruments'],
  '@signalk/maptracker': [
    'signalk-category-web-instruments',
    'signalk-category-ais'
  ],
  gpxload: ['signalk-category-utility'],
  '@digitalyacht/sk-on-kindle': ['signalk-category-hardware'],
  '@ib236/sailinstruments': ['signalk-category-web-instruments'],
  'tuktuk-chart-plotter': ['signalk-category-chart-plotters'],
  'signalk-lcars': ['signalk-category-web-instruments'],
  kgauge: ['signalk-category-web-instruments'],
  'signalk-sbd-msg': ['signalk-category-hardware']
}

module.exports = {
  getCategories,
  getAvailableCategories
}
