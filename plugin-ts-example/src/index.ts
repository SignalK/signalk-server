import { Plugin, ServerAPI } from 'signalk-server/lib/interfaces/plugins'

module.exports = (serverApi: ServerAPI): Plugin => {
  return {
    name: 'Example Plugin in TypeScript',
    id: 'plugin-ts-example',
    schema: () => ({
      properties: {
        propA: {
          type: 'string',
          title: 'Property A'
        },
        propB: {
          type: 'number',
          title: 'Property B'
        }
      }
    }),
    start: (options: any) => {
      serverApi.setProviderStatus(
        `Started with options ${JSON.stringify(options)}`
      )
    },
    stop: () => {
      serverApi.setProviderStatus('Stopped')
    }
  }
}
