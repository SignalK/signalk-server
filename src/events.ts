import Debug, { Debugger } from 'debug'

interface App {
  emit: (...args: any[]) => void
}

interface EventData {
  count: number
  debug: Debugger
}

export function startEventStats(app: App) {
  const eventDataHolder: {
    [eventName: string]: EventData
  } = {}

  const origEmit = app.emit
  app.emit = (...args: any[]) => {
    const [eventName] = args
    if (eventName !== 'serverlog') {
      let eventDebugStat = eventDataHolder[eventName]
      if (!eventDebugStat) {
        const debug = Debug(`signalk-server:events:${eventName}`)
        eventDataHolder[eventName] = eventDebugStat = {
          debug,
          count: 0
        }
      }
      if (eventDebugStat.debug.enabled) {
        eventDebugStat.debug(args.slice(1))
      }
      eventDebugStat.count++
    }
    origEmit.apply(app, [...args])
  }

  let lastStats: { [eventName: string]: number } = {}
  let lastRun = Date.now()

  return setInterval(() => {
    const now = Date.now()
    const statsNow: { [eventName: string]: number } = Object.entries(
      eventDataHolder
    ).reduce((acc, [eventName, stats]) => {
      acc[eventName] = stats.count
      return acc
    }, {} as any)
    app.emit('serverevent', {
      type: 'EVENTSTATISTICS',
      from: 'signalk-server',
      data: {
        periodMillis: now - lastRun,
        periodEndMillis: now,
        stats: Object.entries(statsNow).reduce((acc, [eventName, count]) => {
          acc[eventName] = count - (lastStats[eventName] || 0)
          return acc
        }, {} as any)
      }
    })
    lastRun = now
    lastStats = statsNow
  }, 5 * 1000)
}
