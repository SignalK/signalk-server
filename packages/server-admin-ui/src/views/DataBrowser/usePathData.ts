import { useState, useEffect, useRef } from 'react'
import store, { PathData, MetaData } from './ValueEmittingStore'

// Throttle UI updates to max 5 per second per path
// Data still flows in real-time over WebSocket, only UI re-renders are throttled
const THROTTLE_MS = 200

/**
 * Hook to subscribe to a specific path's data
 * Only re-renders when THIS path's data changes
 * Throttled to prevent CPU spikes from high-frequency updates
 */
export function usePathData(
  context: string,
  path$SourceKey: string
): PathData | null {
  const [data, setData] = useState<PathData | null>(() =>
    store.getPathData(context, path$SourceKey)
  )
  const lastUpdateRef = useRef<number>(0)
  const pendingDataRef = useRef<PathData | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // Get initial data
    setData(store.getPathData(context, path$SourceKey))

    // Subscribe to updates for this specific path
    const unsubscribe = store.subscribe(
      context,
      path$SourceKey,
      (newData: PathData) => {
        const now = Date.now()
        const elapsed = now - lastUpdateRef.current

        if (elapsed >= THROTTLE_MS) {
          // Enough time passed, update immediately
          lastUpdateRef.current = now
          setData(newData)
        } else {
          // Store pending data, schedule update for later
          pendingDataRef.current = newData
          if (!timeoutRef.current) {
            timeoutRef.current = setTimeout(() => {
              if (pendingDataRef.current) {
                lastUpdateRef.current = Date.now()
                setData(pendingDataRef.current)
                pendingDataRef.current = null
              }
              timeoutRef.current = null
            }, THROTTLE_MS - elapsed)
          }
        }
      }
    )

    return () => {
      unsubscribe()
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [context, path$SourceKey])

  return data
}

/**
 * Hook to get metadata for a path
 */
export function useMetaData(
  context: string,
  path: string | undefined
): MetaData | null {
  const [meta, setMeta] = useState<MetaData | null>(() =>
    path ? store.getMeta(context, path) : null
  )

  useEffect(() => {
    if (path) {
      setMeta(store.getMeta(context, path))
    }
  }, [context, path])

  return meta
}
