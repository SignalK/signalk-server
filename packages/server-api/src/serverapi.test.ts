import type { ServerAPI } from './serverapi'

// Type-check test - verify `app.debug` is callable and exposes `.enabled`, so
// plugins can guard expensive log arguments without a local type workaround.
const _typeCheckDebug = (app: ServerAPI): boolean => {
  app.debug('msg')
  return app.debug.enabled
}
void _typeCheckDebug
