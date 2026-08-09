import { expect } from 'chai'
import express from 'express'
import fs from 'fs'
import { AddressInfo } from 'net'
import os from 'os'
import path from 'path'
import zlib from 'zlib'
import { serveStaticFiles } from '../src/staticfiles'

describe('serveStaticFiles', () => {
  let fixtureDir: string
  let baseUrl: string
  let server: ReturnType<typeof express.application.listen>

  before((done) => {
    fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-staticfiles-'))
    fs.writeFileSync(path.join(fixtureDir, 'app.js'), 'plain content')
    fs.writeFileSync(
      path.join(fixtureDir, 'app.js.br'),
      zlib.brotliCompressSync(Buffer.from('brotli content'))
    )
    fs.writeFileSync(
      path.join(fixtureDir, 'app.js.gz'),
      zlib.gzipSync(Buffer.from('gzip content'))
    )
    fs.writeFileSync(path.join(fixtureDir, 'nosidecar.js'), 'no sidecar')
    fs.writeFileSync(path.join(fixtureDir, 'index.html'), '<html></html>')

    const app = express()
    app.use('/webapp', serveStaticFiles(fixtureDir))
    server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo
      baseUrl = `http://localhost:${port}/webapp`
      done()
    })
  })

  after((done) => {
    fs.rmSync(fixtureDir, { recursive: true, force: true })
    server.close(done)
  })

  it('serves the brotli sidecar to a client accepting br', async () => {
    const res = await fetch(`${baseUrl}/app.js`, {
      headers: { 'accept-encoding': 'gzip, deflate, br' }
    })
    expect(res.status).to.equal(200)
    expect(res.headers.get('content-type')).to.match(/javascript/)
    expect(res.headers.get('vary')).to.equal('Accept-Encoding')
    // fetch decodes the body, so content proves which variant was sent
    expect(await res.text()).to.equal('brotli content')
  })

  it('serves the gzip sidecar to a gzip-only client', async () => {
    const res = await fetch(`${baseUrl}/app.js`, {
      headers: { 'accept-encoding': 'gzip' }
    })
    expect(res.status).to.equal(200)
    expect(await res.text()).to.equal('gzip content')
  })

  it('serves the plain file to a client accepting no encodings', async () => {
    const res = await fetch(`${baseUrl}/app.js`, {
      headers: { 'accept-encoding': 'identity' }
    })
    expect(res.status).to.equal(200)
    expect(res.headers.get('content-encoding')).to.equal(null)
    expect(await res.text()).to.equal('plain content')
  })

  it('serves files without sidecars unchanged', async () => {
    const res = await fetch(`${baseUrl}/nosidecar.js`, {
      headers: { 'accept-encoding': 'gzip, deflate, br' }
    })
    expect(res.status).to.equal(200)
    expect(res.headers.get('content-encoding')).to.equal(null)
    expect(await res.text()).to.equal('no sidecar')
  })

  it('serves index.html for a directory request', async () => {
    const res = await fetch(`${baseUrl}/`)
    expect(res.status).to.equal(200)
    expect(await res.text()).to.equal('<html></html>')
  })

  it('leaves req.url intact for downstream routes on fallthrough', async () => {
    const app = express()
    app.use('/', serveStaticFiles(fixtureDir))
    app.get('/api/*', (req, res) => res.json({ url: req.url }))
    const routeServer = app.listen(0)
    await new Promise((resolve) => routeServer.on('listening', resolve))
    try {
      const { port } = routeServer.address() as AddressInfo
      const res = await fetch(`http://localhost:${port}/api/`)
      expect(res.status).to.equal(200)
      expect(await res.json()).to.deep.equal({ url: '/api/' })
    } finally {
      await new Promise<void>((resolve, reject) =>
        routeServer.close((error) => (error ? reject(error) : resolve()))
      )
    }
  })

  it('tolerates a nonexistent root directory', async () => {
    const app = express()
    app.use('/missing', serveStaticFiles(path.join(fixtureDir, 'nope')))
    app.use((_req, res) => res.status(404).end())
    const missingServer = app.listen(0)
    await new Promise((resolve) => missingServer.on('listening', resolve))
    try {
      const { port } = missingServer.address() as AddressInfo
      const res = await fetch(`http://localhost:${port}/missing/x.js`)
      expect(res.status).to.equal(404)
    } finally {
      await new Promise<void>((resolve, reject) =>
        missingServer.close((error) => (error ? reject(error) : resolve()))
      )
    }
  })
})
