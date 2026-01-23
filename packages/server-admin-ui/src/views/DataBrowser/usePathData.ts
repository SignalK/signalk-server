import { useState, useRef, useSyncExternalStore, useCallback } from 'react'
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
  const lastUpdateRef = useRef<number>(0)
  const pendingDataRef = useRef<PathData | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [throttledData, setThrottledData] = useState<PathData | null>(
    () => store.getPathData(context, path$SourceKey) ?? null
  )

  // Use useSyncExternalStore for the base subscription
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const unsubscribe = store.subscribe(
        context,
        path$SourceKey,
        (newData: PathData) => {
          const now = Date.now()
          const elapsed = now - lastUpdateRef.current

          if (elapsed >= THROTTLE_MS) {
            // Enough time passed, update immediately
            lastUpdateRef.current = now
            setThrottledData(newData)
            onStoreChange()
          } else {
            // Store pending data, schedule update for later
            pendingDataRef.current = newData
            if (!timeoutRef.current) {
              timeoutRef.current = setTimeout(() => {
                if (pendingDataRef.current) {
                  lastUpdateRef.current = Date.now()
                  setThrottledData(pendingDataRef.current)
                  pendingDataRef.current = null
                  onStoreChange()
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
    },
    [context, path$SourceKey]
  )

  const getSnapshot = useCallback(
    () => store.getPathData(context, path$SourceKey) ?? null,
    [context, path$SourceKey]
  )

  // useSyncExternalStore ensures proper synchronization with external store
  useSyncExternalStore(subscribe, getSnapshot)

  return throttledData
}

/**
 * Hook to get metadata for a path
 * Uses useSyncExternalStore for proper external store synchronization
 */
export function useMetaData(
  context: string,
  path: string | undefined
): MetaData | null {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!path) return () => {}
      // Meta doesn't have a specific subscription, but we can use the structure subscription
      // which fires when any meta changes
      return store.subscribeToStructure(() => {
        onStoreChange()
      })
    },
    [path]
  )

  const getSnapshot = useCallback(
    () => (path ? (store.getMeta(context, path) ?? null) : null),
    [context, path]
  )

  return useSyncExternalStore(subscribe, getSnapshot)
}
