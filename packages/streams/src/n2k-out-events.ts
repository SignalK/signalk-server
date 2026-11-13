// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Listener = (...args: any[]) => void

interface OutEventApp {
  on(event: string, cb: Listener): void
  removeListener(event: string, cb: Listener): void
}

export interface N2kOutEventOptions {
  /** Comma-separated app events carrying plain-format lines or PGN
   * records to transmit; defaults to nmea2000out. */
  outEvent?: unknown
  /** Comma-separated app events carrying PGN records to transmit;
   * defaults to nmea2000JsonOut. */
  jsonOutEvent?: unknown
}

const eventNames = (value: unknown, fallback: string): string[] => {
  const names =
    typeof value === 'string'
      ? value
          .split(',')
          .map((name) => name.trim())
          .filter((name) => name.length > 0)
      : []
  // A name listed twice would register its listener twice and send
  // every frame twice.
  return names.length > 0 ? [...new Set(names)] : [fallback]
}

/**
 * Listens for outbound N2K on the connection's configured events, as
 * the canboatjs connections do, so that two connections can be fed
 * separately (a bridge between two buses). Returns the unsubscribe.
 */
export function subscribeN2kOut(
  app: OutEventApp,
  options: N2kOutEventOptions,
  onOut: Listener,
  onJsonOut: Listener
): () => void {
  const subscriptions: Array<[string, Listener]> = [
    ...eventNames(options.outEvent, 'nmea2000out').map(
      (event): [string, Listener] => [event, onOut]
    ),
    ...eventNames(options.jsonOutEvent, 'nmea2000JsonOut').map(
      (event): [string, Listener] => [event, onJsonOut]
    )
  ]
  for (const [event, listener] of subscriptions) {
    app.on(event, listener)
  }
  return () => {
    for (const [event, listener] of subscriptions) {
      app.removeListener(event, listener)
    }
  }
}
