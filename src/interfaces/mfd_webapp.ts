import dgram from 'dgram'
import { networkInterfaces } from 'os'
import { createDebug } from '../debug'
import { getExternalPort } from '../ports'
const PUBLISH_PORT = 2053
const MULTICAST_GROUP_IP = '239.2.1.1'
const debug = createDebug('signalk-server:interfaces:mfd_webapps')

// For debugging you can use
// tcpdump -i en0 -A  -v net 239.2.1.1

module.exports = (theApp: any) => {
  return {
    start() {
      const port = getExternalPort(theApp)
      const protocol = theApp.config.settings.ssl ? 'https' : 'http'
      const publishToNavico = getPublishToNavico(protocol, port)
      setInterval(() => publishToNavico(), 10 * 1000)
    }
  }
}

const getPublishMessage = (protocol: string, address: string, port: number) => {
  const prefix = `${protocol}://${address}:${port}`
  return JSON.stringify({
    Version: '1',
    Source: 'SignalK',
    IP: address,
    FeatureName: 'Signal K webapps',
    Text: [
      {
        Language: 'en',
        Name: 'Signal K',
        Description: 'Signal K webapps'
      }
    ],
    Icon: `${prefix}/signalk-logo-transparent.png`,
    URL: `${prefix}/`,
    OnlyShowOnClientIP: 'true',
    BrowserPanel: {
      Enable: true,
      ProgressBarEnable: true,
      MenuText: [
        {
          Language: 'en',
          Name: 'Home'
        }
      ]
    }
  })
}

const send = (
  msg: string,
  fromAddress: string,
  toAddress: string,
  port: number
) => {
  const socket = dgram.createSocket('udp4')
  socket.once('listening', () => {
    socket.send(msg, port, toAddress, () => {
      socket.close()
      debug(`${fromAddress}=>${toAddress} @${port} ${msg}`)
    })
  })
  socket.bind(PUBLISH_PORT, fromAddress)
}

const getPublishToNavico = (protocol: string, port: number) => () => {
  for (const [name, infos] of Object.entries(networkInterfaces())) {
    for (const addressInfo of infos || []) {
      if (addressInfo.family === 'IPv4') {
        send(
          getPublishMessage(protocol, addressInfo.address, port),
          addressInfo.address,
          MULTICAST_GROUP_IP,
          PUBLISH_PORT
        )
      }
    }
  }
}
