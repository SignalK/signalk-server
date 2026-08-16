/**
 * Coalesces PROVIDERSTATUS serverevents.
 *
 * setPluginStatus / setProviderStatus each carry the full status list, and
 * serverevents are written to every admin-UI WebSocket without
 * backpressure, so a plugin calling them in a tight loop can push megabytes
 * per second into each socket. request() emits at most once per
 * PROVIDER_STATUS_MIN_INTERVAL_MS: the first request after a quiet interval
 * emits promptly, and every further request before the interval has passed
 * folds into a single emit scheduled for when it does. The admin UI thus
 * sees the latest status within one interval however chatty the caller is.
 */

export const PROVIDER_STATUS_MIN_INTERVAL_MS = 1000

export class ProviderStatusEmitter {
  private timer: NodeJS.Timeout | undefined
  private lastEmitAt = 0

  constructor(
    private readonly emit: () => void,
    private readonly minIntervalMs = PROVIDER_STATUS_MIN_INTERVAL_MS
  ) {}

  request(): void {
    if (this.timer) return
    const wait = Math.max(0, this.lastEmitAt + this.minIntervalMs - Date.now())
    this.timer = setTimeout(() => {
      this.timer = undefined
      this.emitNow()
    }, wait)
    // A pending status refresh must never keep a stopping server alive.
    this.timer.unref?.()
  }

  /** Emit immediately, dropping any pending request it would duplicate. */
  emitNow(): void {
    this.cancel()
    this.lastEmitAt = Date.now()
    this.emit()
  }

  cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
  }
}
