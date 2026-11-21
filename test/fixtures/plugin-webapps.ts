import { Plugin, ServerAPI } from '@signalk/server-api'

export default function (app: ServerAPI): Plugin {
  return {
    id: 'dynamic-webapp-test',
    name: 'Dynamic Webapp Test',
    schema: {},
    start() {
      app.registerWebapp('battery', {
        displayName: 'Battery Monitor',
        appIcon: 'icon.txt'
      })
      app.registerWebapp('unserved', { displayName: 'No Route' })
    },
    stop() {},
    registerWithRouter(router) {
      router.access('readonly').get('/webapps/battery/', (_req, res) => {
        res.send('plugin page')
      })
      router
        .access('readonly')
        .get('/webapps/battery/icon.txt', (_req, res) => {
          res.send('plugin icon')
        })
    }
  }
}
