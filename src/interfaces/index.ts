/* eslint-disable @typescript-eslint/no-require-imports */
/*
 * The set of built-in interfaces and the order in which they start.
 *
 * Order is significant: 'plugins' must start before 'ws'. The ws interface
 * creates the Primus instance, which snapshots the HTTP server's existing
 * 'upgrade' listeners; the plugin WebSocket dispatcher (installed while
 * plugins start) has to be attached by then.
 */
const interfaceNames = [
  'applicationData',
  'appstore',
  'logfiles',
  'mfd_webapp',
  'n2k-discovery',
  'nmea-tcp',
  'playground',
  'plugins',
  'providers',
  'rest',
  'tcp',
  'unitpreferences-api',
  'wasm',
  'webapps',
  'ws'
]

const availableInterfaces: { [name: string]: unknown } = {}
for (const name of interfaceNames) {
  availableInterfaces[name] = require('./' + name)
}

export = availableInterfaces
