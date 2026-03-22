import path from 'path'
import { unlinkSync, existsSync } from 'fs'
import { freeport } from './ts-servertestutilities'
import { startServerP, serverTestConfigDirectory } from './servertestutilities'

describe('SSL certificate generation', function () {
  this.timeout(15000)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let server: any

  afterEach(async function () {
    if (server) {
      await server.stop()
      server = null
    }
  })

  it('generates a cert that works with modern OpenSSL', async function () {
    const configDir = serverTestConfigDirectory()
    const certFile = path.join(configDir, 'ssl-cert.pem')
    const keyFile = path.join(configDir, 'ssl-key.pem')

    // Delete cached certs to force regeneration
    if (existsSync(certFile)) unlinkSync(certFile)
    if (existsSync(keyFile)) unlinkSync(keyFile)

    const port = await freeport()
    const sslPort = await freeport()

    // Start server with SSL enabled — this will generate new certs
    // and create an HTTPS server. With 1024-bit keys this throws
    // ERR_SSL_EE_KEY_TOO_SMALL on Node with OpenSSL 3.x
    server = await startServerP(port, false, {
      settings: { ssl: true, sslport: sslPort }
    })
  })
})
