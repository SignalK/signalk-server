// 90s threshold: covers Maretron-class devices that send Heartbeat (PGN
// 126993) only every 60s, plus margin for occasional jitter. Anything
// shorter risks flapping for slow-cycle PGNs.
export const ONLINE_THRESHOLD_MS = 90_000

/**
 * Decide whether a device is stale enough to be removed by Reset Stale.
 *
 * Folds in both freshness signals (value-bearing deltas and raw N2K
 * frames) so the Reset Stale predicate matches the Online badge logic
 * in buildSourceStatuses. A device that emits only meta PGNs (Heartbeat
 * / Address Claim / Product Information) — or whose data PGNs aren't
 * mapped to Signal K paths — is shown Online and must not be reset.
 */
export function isDeviceStale(
  metaLastSeen: number | undefined,
  frameLastSeen: number | undefined,
  now: number,
  thresholdMs: number = ONLINE_THRESHOLD_MS
): boolean {
  const lastSeen =
    metaLastSeen !== undefined && frameLastSeen !== undefined
      ? Math.max(metaLastSeen, frameLastSeen)
      : (metaLastSeen ?? frameLastSeen)
  return lastSeen === undefined || now - lastSeen >= thresholdMs
}
