import { expect } from 'chai'
import { EventEmitter } from 'events'
import { SerialPortMock, SerialPortMockOpenOptions } from 'serialport'
import SerialStream from './serialport'
import { createMockApp, createDebugStub } from './test-helpers'

type LoadFn = (
  request: string,
  parent: NodeModule | null,
  isMain: boolean
) => unknown

const Module = require('node:module') as typeof import('node:module') & {
  _load: LoadFn
}

const DEVICE = '/dev/ttyTEST0'
const SETTLE_MS = 50

interface Report {
  type: 'status' | 'error'
  msg: string
}

const openedPorts: SerialPortMock[] = []

class RecordedSerialPort extends SerialPortMock {
  constructor(options: SerialPortMockOpenOptions) {
    super(options)
    openedPorts.push(this)
  }
}

function lastPort(): SerialPortMock {
  const port = openedPorts[openedPorts.length - 1]
  if (!port) {
    throw new Error('No serial port was created')
  }
  return port
}

function createRecordingApp() {
  const app = createMockApp()
  const reports: Report[] = []
  const reported = new EventEmitter()
  const record = (type: Report['type'], msg: string) => {
    reports.push({ type, msg })
    reported.emit('report')
  }
  app.setProviderStatus = (_id: string, msg: string) => record('status', msg)
  app.setProviderError = (_id: string, msg: string) => record('error', msg)

  const waitFor = (predicate: (r: Report) => boolean): Promise<void> =>
    new Promise((resolve) => {
      const check = () => {
        if (reports.some(predicate)) {
          reported.off('report', check)
          resolve()
        }
      }
      reported.on('report', check)
      check()
    })

  return { app, reports, waitFor }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, SETTLE_MS))

const isConnected = (r: Report) => r.msg === `Connected to ${DEVICE}`
const isRetrying = (r: Report) => r.msg.startsWith('Not connected')

// What the Dashboard shows as Last Error after these reports: the server's
// doSetProviderStatus keeps the previous message whenever an error is
// replaced by a different message.
function lastErrorAfter(reports: Report[]): string | undefined {
  let current: Report | undefined
  let lastError: string | undefined
  for (const r of reports) {
    if (current?.type === 'error' && current.msg !== r.msg) {
      lastError = current.msg
    }
    current = r
  }
  return lastError
}

describe('SerialStream provider status', () => {
  const originalLoad = Module._load
  let stream: SerialStream | undefined

  before(() => {
    Module._load = ((request, parent, isMain) => {
      if (request === 'serialport') {
        return { SerialPort: RecordedSerialPort }
      }
      return originalLoad(request, parent, isMain)
    }) as LoadFn
  })

  after(() => {
    Module._load = originalLoad
  })

  afterEach(() => {
    stream?.end()
    stream = undefined
    openedPorts.length = 0
    SerialPortMock.binding.reset()
  })

  function startStream(app: ReturnType<typeof createMockApp>): SerialStream {
    stream = new SerialStream({
      device: DEVICE,
      baudrate: 4800,
      app,
      providerId: 'test-serial',
      createDebug: createDebugStub()
    })
    return stream
  }

  it('reports a status when the port opens', async () => {
    SerialPortMock.binding.createPort(DEVICE)
    const { app, reports, waitFor } = createRecordingApp()
    startStream(app)

    await waitFor(isConnected)

    expect(reports).to.deep.equal([
      { type: 'status', msg: `Connected to ${DEVICE}` }
    ])
  })

  it('reports only errors while the device is missing at startup', async () => {
    const { app, reports, waitFor } = createRecordingApp()
    startStream(app)

    await waitFor(isRetrying)

    expect(reports.length).to.be.greaterThan(0)
    expect(reports.map((r) => r.type)).to.not.include('status')
  })

  it('reports only errors after the device is unplugged', async () => {
    SerialPortMock.binding.createPort(DEVICE)
    const { app, reports, waitFor } = createRecordingApp()
    startStream(app)
    await waitFor(isConnected)
    const connectedCount = reports.length

    lastPort()._disconnected(new Error('device unplugged'))
    await waitFor(isRetrying)

    const afterUnplug = reports.slice(connectedCount)
    expect(afterUnplug.length).to.be.greaterThan(0)
    expect(afterUnplug.map((r) => r.type)).to.not.include('status')
  })

  it('goes from error to connected when the device is plugged in', async function () {
    this.timeout(5000)
    const { app, reports, waitFor } = createRecordingApp()
    startStream(app)
    await waitFor(isRetrying)
    const beforePlugIn = reports.slice()

    SerialPortMock.binding.createPort(DEVICE)
    await waitFor(isConnected)

    expect(beforePlugIn[beforePlugIn.length - 1]?.type).to.equal('error')
    expect(reports[reports.length - 1]).to.deep.equal({
      type: 'status',
      msg: `Connected to ${DEVICE}`
    })
  })

  it('keeps the device error in Last Error after the device is plugged in', async function () {
    this.timeout(5000)
    const { app, reports, waitFor } = createRecordingApp()
    startStream(app)
    await waitFor(isRetrying)
    const deviceError = reports[0]!.msg

    SerialPortMock.binding.createPort(DEVICE)
    await waitFor(isConnected)

    expect(lastErrorAfter(reports)).to.include(deviceError)
  })

  it('keeps the unplug error in Last Error after reconnecting', async function () {
    this.timeout(5000)
    SerialPortMock.binding.createPort(DEVICE)
    const { app, reports, waitFor } = createRecordingApp()
    startStream(app)
    await waitFor(isConnected)
    const connectedCount = reports.length

    lastPort()._disconnected(new Error('device unplugged'))
    await waitFor((r) => reports.indexOf(r) > connectedCount && isConnected(r))

    expect(lastErrorAfter(reports)).to.include('device unplugged')
  })

  it('reports nothing when stopped while connected', async () => {
    SerialPortMock.binding.createPort(DEVICE)
    const { app, reports, waitFor } = createRecordingApp()
    const serial = startStream(app)
    await waitFor(isConnected)
    const reportCount = reports.length

    serial.end()
    await settle()

    expect(reports.slice(reportCount)).to.deep.equal([])
  })

  it('reports nothing when stopped while waiting to retry', async () => {
    const { app, reports, waitFor } = createRecordingApp()
    const serial = startStream(app)
    await waitFor(isRetrying)
    const reportCount = reports.length

    serial.end()
    await settle()

    expect(reports.slice(reportCount)).to.deep.equal([])
  })
})
