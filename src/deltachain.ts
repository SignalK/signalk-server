import { Delta, DeltaInputHandler, SKVersion } from '@signalk/server-api'

type Dispatch = (msg: Delta, now: Date, version: SKVersion) => void

export default class DeltaChain {
  private chain: DeltaInputHandler[] = []

  // Run every registered input handler over `msg`, then hand the result
  // to `dispatch`. Each handler gets (delta, next); calling next forwards
  // the (possibly modified) delta to the next handler, and `dispatch`
  // runs only once the chain is exhausted. A handler that never calls
  // next drops the delta — `dispatch` is not invoked.
  //
  // The caller supplies `dispatch` rather than the chain owning a fixed
  // terminal, so handlers run BEFORE source-priority filtering and
  // caching (the registerDeltaInputHandler contract) while that
  // downstream pipeline stays in handleMessage. `dispatch` is a single
  // hoisted function; the per-message context it needs (timestamp, sk
  // version) is threaded as arguments so nothing is allocated per delta.
  process(msg: Delta, dispatch: Dispatch, now: Date, version: SKVersion) {
    this.doProcess(0, msg, dispatch, now, version)
  }

  private doProcess(
    index: number,
    msg: Delta,
    dispatch: Dispatch,
    now: Date,
    version: SKVersion
  ) {
    if (index >= this.chain.length) {
      dispatch(msg, now, version)
      return
    }
    // Isolate handlers: a plugin's delta input handler that throws must not
    // abort the chain, or the delta (and any later handler's work, including
    // metadata registration) is silently dropped for every input. Log and
    // pass the unmodified delta to the next handler. `continued` guards
    // against advancing twice when a handler calls next() and then throws.
    let continued = false
    const next = (nextMsg: Delta) => {
      if (continued) {
        return
      }
      continued = true
      this.doProcess(index + 1, nextMsg, dispatch, now, version)
    }
    try {
      this.chain[index](msg, next)
    } catch (err) {
      console.error('Delta input handler threw, skipping it:', err)
      next(msg)
    }
  }

  register(handler: DeltaInputHandler) {
    this.chain.push(handler)
    return () => {
      const handlerIndex = this.chain.indexOf(handler)
      if (handlerIndex >= 0) {
        this.chain.splice(handlerIndex, 1)
      }
    }
  }
}
