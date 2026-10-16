import { expect } from 'chai'
import { startServer } from './ts-servertestutilities'

const ZONED_PATH = 'electrical.batteries.house.voltage'
const IN_ALARM_ZONE = 15
const POLL_INTERVAL_MS = 50
const POLL_ATTEMPTS = 40
// Zones hands its delta to process.nextTick, so once the triggering value
// is readable any zone notification is already in the model; this margin
// covers the HTTP round trips around it.
const SETTLE_MS = 300

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type Server = Awaited<ReturnType<typeof startServer>>

const readJson = async (server: Server, path: string) => {
  const response = await server.getV1(`/vessels/self/${path}`)
  return response.status === 200 ? response.json() : undefined
}

const pollFor = async (server: Server, path: string) => {
  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    const body = await readJson(server, path)
    if (body !== undefined) {
      return body
    }
    await sleep(POLL_INTERVAL_MS)
  }
  return undefined
}

const crossZone = async (server: Server) => {
  await server.sendADelta({
    updates: [
      {
        meta: [
          {
            path: ZONED_PATH,
            value: {
              zones: [{ lower: 14.4, state: 'alarm', message: 'High voltage' }]
            }
          }
        ]
      }
    ]
  })
  await server.sendDelta(ZONED_PATH, IN_ALARM_ZONE)
  const value = await pollFor(server, ZONED_PATH.replace(/\./g, '/'))
  expect(value).to.have.property('value', IN_ALARM_ZONE)
}

const notificationPath = `notifications/${ZONED_PATH.replace(/\./g, '/')}`

describe('Legacy zones follow the Manage Notifications setting', () => {
  it('emits a zone notification when the setting is on (default)', async () => {
    const server = await startServer()
    try {
      await crossZone(server)
      const notification = await pollFor(server, notificationPath)
      expect(notification).to.have.nested.property('value.state', 'alarm')
    } finally {
      await server.stop()
    }
  })

  it('emits nothing when the setting is off', async () => {
    const server = await startServer({
      notifications: { manageNotifications: false }
    })
    try {
      await crossZone(server)
      await sleep(SETTLE_MS)
      expect(await readJson(server, notificationPath)).to.equal(undefined)
    } finally {
      await server.stop()
    }
  })
})
