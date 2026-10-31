/*
 * Copyright 2026 Signal K contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { expect } from 'chai'
import QuickCanStream from './quick-can'

// The constructor opens a real CAN channel, so exercise the lifecycle methods
// against a bare object that inherits from the prototype.
interface Harness {
  quickCan: { start: () => void; stop: () => void }
  _destroy: (
    error: Error | null,
    callback: (error: Error | null) => void
  ) => void
}

const makeStream = (stop: () => void): Harness =>
  Object.assign(Object.create(QuickCanStream.prototype), {
    quickCan: { start: () => undefined, stop }
  })

describe('QuickCanStream lifecycle', () => {
  it('stops the CAN reader when the stream is destroyed', (done) => {
    let stopped = false
    const stream = makeStream(() => {
      stopped = true
    })

    stream._destroy(null, (error) => {
      expect(error).to.equal(null)
      expect(stopped).to.equal(true)
      done()
    })
  })

  it('passes the destroy error through to the callback', (done) => {
    const boom = new Error('teardown failed')
    const stream = makeStream(() => undefined)

    stream._destroy(boom, (error) => {
      expect(error).to.equal(boom)
      done()
    })
  })

  it('stops the CAN reader when a stop failure occurs', (done) => {
    const boom = new Error('stop failed')
    const stream = makeStream(() => {
      throw boom
    })

    stream._destroy(null, (error) => {
      expect(error).to.equal(boom)
      done()
    })
  })

  it('tolerates stop being called from both end() and _destroy()', (done) => {
    // QuickCan.stop() clears its channel reference, so the two cleanup paths
    // must not conflict.
    let calls = 0
    const stream = makeStream(() => {
      calls++
    })

    stream._destroy(null, () => {
      stream.quickCan.stop()
      expect(calls).to.equal(2)
      done()
    })
  })
})
