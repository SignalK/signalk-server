import type { Application } from 'typedoc'
import { SignalKTheme } from './SignalKTheme.js'

/**
 * Called by TypeDoc when loading this theme as a plugin
 */
export function load(app: Application) {
  app.renderer.defineTheme('signalk', SignalKTheme)

  app.on('bootstrapEnd', () => {
    if (
      app.options.isSet('theme') &&
      app.options.getValue('theme') !== 'signalk'
    ) {
      return app.logger.warn(
        `The theme 'signalk' is not used because another theme (${app.options.getValue(
          'theme'
        )}) was specified!`
      )
    }

    app.options.setValue('theme', 'signalk')
  })
}
