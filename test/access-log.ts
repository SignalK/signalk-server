import { expect } from 'chai'
import http from 'http'
import { AddressInfo } from 'net'
import { accessLogger } from '../src/config/access-log'

const TOKEN = 'header.payload.signature'

function logLine(format: string, path: string, referer: string) {
  return new Promise<string>((resolve, reject) => {
    let line = ''
    const log = accessLogger(format, {
      immediate: true,
      stream: {
        write: (written: string) => {
          line = written
        }
      }
    })
    const server = http.createServer((req, res) =>
      log(req, res, () => res.end())
    )
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      http
        .get({ host: '127.0.0.1', port, path, headers: { referer } }, (res) => {
          res.resume()
          res.on('end', () => server.close(() => resolve(line)))
        })
        .on('error', reject)
    })
  })
}

describe('Access log', function () {
  const path = `/dashboard/?layout=helm&token=${TOKEN}&theme=night`
  const referer = `http://boat.local/?token=${TOKEN}`

  it('redacts the token in the combined format', async function () {
    const line = await logLine('combined', path, referer)
    expect(line).to.not.include(TOKEN)
    expect(line).to.include(
      '/dashboard/?layout=helm&token=REDACTED&theme=night'
    )
    expect(line).to.include('http://boat.local/?token=REDACTED')
  })

  it('redacts the token in the dev format', async function () {
    const line = await logLine('dev', path, referer)
    expect(line).to.not.include(TOKEN)
    expect(line).to.include(
      '/dashboard/?layout=helm&token=REDACTED&theme=night'
    )
  })
})
