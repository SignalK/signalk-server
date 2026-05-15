import { expect } from 'chai'
import { EventEmitter } from 'node:events'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const debugCore = require('debug')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { wrapEmitter } = require('../dist/events.js')

describe('wrapEmitter', () => {
  describe('serverlog recursion', () => {
    it('does not recurse when stdout.write re-emits serverlog with events debug enabled', () => {
      // Reproduces the interaction between src/logging.js (which hooks
      // process.stdout.write to re-emit content as a `serverlog` event)
      // and the per-event debug instances created by wrapEmitter. With
      // DEBUG=signalk-server:events:* enabled, the emitter-id-prefixed
      // `serverlog` emit calls eventDebug, which writes to stdout, which
      // re-emits, etc. — and the call stack overflows.

      const wrapped = wrapEmitter(new EventEmitter())
      const originalWrite = process.stdout.write.bind(process.stdout)
      const originalDebugLog = debugCore.log

      let stdoutWriteCount = 0
      ;(process.stdout.write as unknown) = (chunk: unknown) => {
        stdoutWriteCount++
        wrapped.emit('serverlog', { row: String(chunk) })
        return true
      }
      // Mirror src/logging.js: send debug output to stdout (not stderr).
      debugCore.log = console.info.bind(console)
      debugCore.enable('signalk-server:events:*')

      try {
        wrapped.emit('serverlog', { row: 'hello' })
        // With the fix the prefixed `<emitterId>:serverlog` event is
        // suppressed from debug output, so the hooked stdout.write is
        // never reached.
        expect(stdoutWriteCount).to.equal(0)
      } finally {
        ;(process.stdout.write as unknown) = originalWrite
        debugCore.disable()
        debugCore.log = originalDebugLog
      }
    })
  })
})
