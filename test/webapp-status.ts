import { expect } from 'chai'
import WebSocket from 'ws'
import { startServer } from './ts-servertestutilities'
import { WebappStatus } from '@signalk/server-api'

const SERVER_START_TIMEOUT_MS = 60000
const WEBAPP_NAME = '@signalk/server-admin-ui'

type WebappStatusMap = Record<string, WebappStatus>

const statusUrl = (host: string, name: string) =>
  `${host}/skServer/webapps/${encodeURIComponent(name)}/status`

const putStatus = (host: string, name: string, body: unknown) =>
  fetch(statusUrl(host, name), {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' }
  })

// Read the first WEBAPPS_STATUS event replayed to a freshly-connected
// serverevents client — this is the mechanism the sidebar relies on to show
// badges without visiting the Webapps view.
const firstReplayedStatus = (host: string): Promise<WebappStatusMap> => {
  const wsUrl =
    host.replace(/^http/, 'ws') + '/signalk/v1/stream?serverevents=all'
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    const timer = setTimeout(() => {
      ws.close()
      reject(new Error('no WEBAPPS_STATUS event replayed'))
    }, 5000)
    ws.on('message', (raw: WebSocket.RawData) => {
      const msg = JSON.parse(raw.toString())
      if (msg.type === 'WEBAPPS_STATUS') {
        clearTimeout(timer)
        ws.close()
        resolve(msg.data)
      }
    })
    ws.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

describe('Webapp status counts', function () {
  this.timeout(SERVER_START_TIMEOUT_MS)

  it('reports counts and clears them on zero counts', async () => {
    const { host, stop } = await startServer()
    try {
      const response = await putStatus(host, WEBAPP_NAME, {
        warnCount: 2,
        errorCount: 1
      })
      expect(response.status).to.equal(200)
      expect(await response.json()).to.deep.equal({ ok: true })

      const afterReport = await firstReplayedStatus(host)
      expect(afterReport[WEBAPP_NAME]).to.include({
        warnCount: 2,
        errorCount: 1
      })

      const clearResponse = await putStatus(host, WEBAPP_NAME, {
        warnCount: 0,
        errorCount: 0
      })
      expect(clearResponse.status).to.equal(200)

      const afterClear = await firstReplayedStatus(host)
      expect(afterClear).to.not.have.property(WEBAPP_NAME)
    } finally {
      await stop()
    }
  })

  it('rejects unknown webapps and invalid counts', async () => {
    const { host, stop } = await startServer()
    try {
      const unknownResponse = await putStatus(host, 'not-installed-webapp', {
        warnCount: 1,
        errorCount: 0
      })
      expect(unknownResponse.status).to.equal(404)

      for (const body of [
        { warnCount: -1, errorCount: 0 },
        { warnCount: 0, errorCount: 'x' },
        { warnCount: 1.5, errorCount: 0 },
        { warnCount: Number.MAX_SAFE_INTEGER + 1, errorCount: 0 },
        {}
      ]) {
        const response = await putStatus(host, WEBAPP_NAME, body)
        expect(response.status).to.equal(400)
      }
    } finally {
      await stop()
    }
  })
})
