import type { ServerAPI } from './serverapi'

// Type-check test - verify `app.debug` is callable and exposes `.enabled`, so
// plugins can guard expensive log arguments without a local type workaround.
const _typeCheckDebug = (app: ServerAPI): boolean => {
  app.debug('msg')
  return app.debug.enabled
}
void _typeCheckDebug

// Type-check test - the device API is optional, so a plugin that also runs
// on older servers has to guard its calls.
const _typeCheckDeviceApi = (app: ServerAPI): void => {
  // @ts-expect-error the device API may be missing
  app.getDevicePluginData('client')
  app.getDevicePluginData?.('client')
}
void _typeCheckDeviceApi
