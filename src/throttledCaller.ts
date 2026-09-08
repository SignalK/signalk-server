/**
 * Coalesces calls made through request() to at most one per minimum interval.
 *
 * The first request after a quiet interval calls promptly, and every further
 * request before the interval has passed folds into a single call scheduled
 * for when it does. A caller that requests in a tight loop therefore costs one
 * call per interval rather than one per request, while the callee still
 * observes the latest state within one interval. callNow() bypasses the
 * interval and calls straight away.
 */
export class ThrottledCaller {
  private timer: NodeJS.Timeout | undefined
  private lastCallAt = 0

  constructor(
    private readonly call: () => void,
    private readonly minIntervalMs: number
  ) {}

  request(): void {
    if (this.timer) return
    const wait = Math.max(0, this.lastCallAt + this.minIntervalMs - Date.now())
    this.timer = setTimeout(() => {
      this.timer = undefined
      this.callNow()
    }, wait)
    // A pending call must never keep a stopping server alive.
    this.timer.unref?.()
  }

  /** Call immediately, dropping any pending request it would duplicate. */
  callNow(): void {
    this.cancel()
    this.lastCallAt = Date.now()
    this.call()
  }

  cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
  }
}
