import { startServerP } from '../servertestutilities'
import { setTimeout as delay } from 'node:timers/promises'

async function main() {
  const ssl = process.argv[2] === 'ssl'
  const server = await startServerP(
    Number(process.env.TEST_HTTP_PORT),
    false,
    {
      settings: {
        ssl,
        sslport: Number(process.env.TEST_HTTPS_PORT),
        mdns: false,
        pipedProviders: [],
        interfaces: { plugins: false, tcp: false, udp: false }
      }
    },
    undefined,
    process.env.SIGNALK_NODE_CONFIG_DIR
  )
  try {
    if (ssl) {
      for (let i = 0; !server.app.redirectServer && i < 100; i++) {
        await delay(10)
      }
      if (!server.app.redirectServer) throw new Error('Redirect did not start')
    }
    console.log(
      'LISTENERS',
      JSON.stringify({
        primary: server.app.server.address(),
        redirect: server.app.redirectServer?.address()
      })
    )
  } finally {
    await server.stop()
  }
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error: unknown) => {
      console.error(error)
      process.exit(1)
    })
}
