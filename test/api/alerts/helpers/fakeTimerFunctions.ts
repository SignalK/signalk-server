/**
 * Fake timer functions for the alerts suites.
 *
 * Lets a test advance simulated time and observe which timers fired, without
 * waiting on wall-clock time.
 */

import type {
  TimerFunctions,
  TimerHandle
} from '../../../../src/api/alerts/escalationTimer'

interface PendingTimer {
  callback: () => void
  expiresAt: number
}

export class FakeTimerFunctions implements TimerFunctions {
  private nextId = 1
  private timers = new Map<number, PendingTimer>()
  private currentTime = 0

  setTimeout(callback: () => void, ms: number): TimerHandle {
    const id = this.nextId++
    this.timers.set(id, { callback, expiresAt: this.currentTime + ms })
    return id
  }

  clearTimeout(handle: TimerHandle): void {
    this.timers.delete(handle as number)
  }

  /**
   * Advance time by the specified milliseconds and fire expired timers.
   *
   * Time moves to each timer's own expiry before that timer runs, never
   * straight to the target. A callback that schedules another timer then gets
   * the delay it asked for measured from when it actually ran, as it would
   * with real timers.
   */
  advanceTime(ms: number): void {
    const target = this.currentTime + ms

    for (;;) {
      const next = this.nextExpiryUpTo(target)
      if (next === undefined) {
        break
      }
      this.currentTime = Math.max(this.currentTime, next.timer.expiresAt)
      // Deleted before the callback runs, so a callback that reschedules the
      // same alert does not have its new timer removed by this iteration.
      this.timers.delete(next.id)
      next.timer.callback()
    }

    this.currentTime = target
  }

  /** The earliest timer due at or before `limit`, if any is still pending. */
  private nextExpiryUpTo(
    limit: number
  ): { id: number; timer: PendingTimer } | undefined {
    let earliest: { id: number; timer: PendingTimer } | undefined
    for (const [id, timer] of this.timers) {
      if (timer.expiresAt > limit) {
        continue
      }
      if (
        earliest === undefined ||
        timer.expiresAt < earliest.timer.expiresAt
      ) {
        earliest = { id, timer }
      }
    }
    return earliest
  }

  getPendingCount(): number {
    return this.timers.size
  }

  getCurrentTime(): number {
    return this.currentTime
  }

  reset(): void {
    this.timers.clear()
    this.currentTime = 0
    this.nextId = 1
  }
}
