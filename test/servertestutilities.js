module.exports = {
  startServerP: function startServerP (port) {
    const Server = require('../lib')
    const server = new Server({
      config: {
        defaults: {
          vessels: {
            self: {
              uuid: 'urn:mrn:signalk:uuid:c0d79334-4e25-4245-8892-54e8ccc8021d'
            }
          }
        },
        settings: {
          port,
          pipedProviders: [
            {
              id: 'deltaFromHttp',
              pipeElements: [
                {
                  type: 'test/httpprovider'
                }
              ]
            }
          ],
          interfaces: {
            plugins: false
          }
        }
      }
    })
    return server.start()
  }
}
