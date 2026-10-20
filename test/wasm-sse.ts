import { expect } from 'chai'
import { EventEmitter } from 'events'
import type { Response } from 'express'
import {
  closeSseStreamsForPlugin,
  formatSseEvent,
  openSseStream,
  sendSseEvent,
  SSE_MAX_BUFFERED_BYTES
} from '../dist/wasm/bindings/sse'

interface FakeResponse extends EventEmitter {
  writes: string[]
  writableLength: number
  writableEnded: boolean
  destroyed: boolean
}

/**
 * Minimal stand-in for an Express response that records writes and
 * mimics the end/destroy semantics the SSE registry relies on.
 */
function fakeResponse(): FakeResponse {
  const res = new EventEmitter() as FakeResponse
  Object.assign(res, {
    writes: [],
    writableLength: 0,
    writableEnded: false,
    destroyed: false,
    status: () => res,
    setHeader: () => res,
    flushHeaders: () => undefined,
    write: (chunk: string | Buffer) => {
      res.writes.push(chunk.toString())
      return true
    },
    end: () => {
      res.writableEnded = true
      res.emit('close')
    },
    destroy: () => {
      res.destroyed = true
      res.emit('close')
    }
  })
  return res
}

/** Register a fake client on a channel, as an HTTP handler would. */
function subscribe(
  pluginId: string,
  channel: string,
  initial?: string
): FakeResponse {
  const res = fakeResponse()
  openSseStream(pluginId, channel, res as unknown as Response, initial)
  return res
}

describe('WASM SSE channels', () => {
  const pluginId = 'sse-test-plugin'

  afterEach(() => {
    closeSseStreamsForPlugin(pluginId)
  })

  describe('formatSseEvent', () => {
    it('writes one data line per line of data, whatever the line ending', () => {
      expect(formatSseEvent('patch', 'a\nb\r\nc\rd')).to.equal(
        'event: patch\ndata: a\ndata: b\ndata: c\ndata: d\n\n'
      )
    })

    it('omits the event line for an empty event name', () => {
      expect(formatSseEvent('', 'x')).to.equal('data: x\n\n')
    })
  })

  describe('sendSseEvent', () => {
    it('sends the initial body only to the joining client', () => {
      const first = subscribe(pluginId, 'panel', 'data: first\n\n')
      const second = subscribe(pluginId, 'panel')
      expect(first.writes).to.deep.equal(['data: first\n\n'])
      expect(second.writes).to.deep.equal([])
    })

    it('reaches every client of the channel and no other channel', () => {
      const a = subscribe(pluginId, 'panel')
      const b = subscribe(pluginId, 'panel')
      const other = subscribe(pluginId, 'other')

      expect(sendSseEvent(pluginId, 'panel', 'e', 'd')).to.equal(2)
      expect(a.writes).to.deep.equal(['event: e\ndata: d\n\n'])
      expect(b.writes).to.deep.equal(['event: e\ndata: d\n\n'])
      expect(other.writes).to.deep.equal([])
    })

    it('keeps channels of different plugins apart', () => {
      subscribe(pluginId, 'panel')
      expect(sendSseEvent('another-plugin', 'panel', 'e', 'd')).to.equal(0)
    })

    it('rejects an event name containing a line break', () => {
      const res = subscribe(pluginId, 'panel')
      expect(sendSseEvent(pluginId, 'panel', 'bad\nname', 'd')).to.equal(-1)
      expect(res.writes).to.deep.equal([])
    })

    it('rejects an event that alone exceeds the per-client limit', () => {
      const res = subscribe(pluginId, 'panel')
      const data = 'x'.repeat(SSE_MAX_BUFFERED_BYTES)
      expect(sendSseEvent(pluginId, 'panel', 'e', data)).to.equal(-1)
      expect(res.writes).to.deep.equal([])
      expect(res.destroyed).to.equal(false)
    })

    it('drops a client that the next event would take over the limit', () => {
      const nearlyFull = subscribe(pluginId, 'panel')
      const fast = subscribe(pluginId, 'panel')
      nearlyFull.writableLength = SSE_MAX_BUFFERED_BYTES - 1

      expect(sendSseEvent(pluginId, 'panel', 'e', 'd')).to.equal(1)
      expect(nearlyFull.destroyed).to.equal(true)
      expect(fast.writes).to.have.length(1)
    })

    it('does not register a client whose initial body exceeds the limit', () => {
      const res = subscribe(
        pluginId,
        'panel',
        'x'.repeat(SSE_MAX_BUFFERED_BYTES + 1)
      )
      expect(res.destroyed).to.equal(true)
      expect(res.writes).to.deep.equal([])
      expect(sendSseEvent(pluginId, 'panel', 'e', 'd')).to.equal(0)
    })

    it('drops a client whose queued output exceeds the limit', () => {
      const slow = subscribe(pluginId, 'panel')
      const fast = subscribe(pluginId, 'panel')
      slow.writableLength = SSE_MAX_BUFFERED_BYTES + 1

      expect(sendSseEvent(pluginId, 'panel', 'e', 'd')).to.equal(1)
      expect(slow.destroyed).to.equal(true)
      expect(fast.writes).to.have.length(1)
      expect(sendSseEvent(pluginId, 'panel', 'e', 'd')).to.equal(1)
    })

    it('forgets a client once its connection closes', () => {
      const res = subscribe(pluginId, 'panel')
      res.emit('close')
      expect(sendSseEvent(pluginId, 'panel', 'e', 'd')).to.equal(0)
    })

    it('does not register a client that disconnected before the stream opened', () => {
      const res = fakeResponse()
      res.destroyed = true
      openSseStream(pluginId, 'panel', res as unknown as Response)
      expect(sendSseEvent(pluginId, 'panel', 'e', 'd')).to.equal(0)
    })
  })

  describe('closeSseStreamsForPlugin', () => {
    it('ends every stream of the plugin', () => {
      const a = subscribe(pluginId, 'panel')
      const b = subscribe(pluginId, 'other')

      closeSseStreamsForPlugin(pluginId)

      expect(a.writableEnded).to.equal(true)
      expect(b.writableEnded).to.equal(true)
      expect(sendSseEvent(pluginId, 'panel', 'e', 'd')).to.equal(0)
    })

    it('destroys a stream whose output has not drained', () => {
      const stalled = subscribe(pluginId, 'panel')
      stalled.writableLength = 1

      closeSseStreamsForPlugin(pluginId)

      expect(stalled.destroyed).to.equal(true)
      expect(stalled.writableEnded).to.equal(false)
    })
  })
})
