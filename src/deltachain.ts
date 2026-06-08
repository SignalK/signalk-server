import { Delta, DeltaInputHandler } from '@signalk/server-api'

type Next = (msg: Delta) => void

export default class DeltaChain {
  private chain: DeltaInputHandler[] = []
  private next: Next[] = []

  constructor(private dispatchMessage: (msg: Delta) => void) {}

  process(msg: Delta) {
    return this.doProcess(0, msg)
  }

  doProcess(index: number, msg: Delta) {
    if (index >= this.chain.length) {
      this.dispatchMessage(msg)
      return
    }
    this.chain[index](msg, this.next[index])
  }

  register(handler: DeltaInputHandler) {
    this.chain.push(handler)
    this.updateNexts()
    return () => {
      const handlerIndex = this.chain.indexOf(handler)
      if (handlerIndex >= 0) {
        this.chain.splice(handlerIndex, 1)
        this.updateNexts()
      }
    }
  }

  updateNexts() {
    this.next = this.chain.map((_handler, index) => (msg: Delta) => {
      this.doProcess(index + 1, msg)
    })
  }
}
