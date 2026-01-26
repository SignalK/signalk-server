import { useRef, useSyncExternalStore, useCallback } from 'react'
import { useStore } from '../../store'
import type { PathData, MetaData } from '../../store'

// Throttle UI updates to max 5 per second per path
// Data still flows in real-time over WebSocket, only UI re-renders are throttled
const THROTTLE_MS = 200

/**
 * Hook to subscribe to a specific path's data from Zustand
 * Only re-renders when THIS path's data changes
 * Throttled to prevent CPU spikes from high-frequency updates
 */
export function usePathData(
  context: string,
  path$SourceKey: string
): PathData | null {
  // Refs for throttling - these persist across renders
  const lastUpdateRef = useRef<number>(0)
  const cachedDataRef = useRef<PathData | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const listenerRef = useRef<(() => void) | null>(null)

  // Subscribe to Zustand with throttled updates
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      listenerRef.current = onStoreChange

      // Subscribe to Zustand store changes for this specific path
      const unsubscribe = useStore.subscribe(
        (state) => state.signalkData[context]?.[path$SourceKey],
        (newData) => {
          const now = Date.now()
          const elapsed = now - lastUpdateRef.current

          if (elapsed >= THROTTLE_MS) {
            // Enough time passed, update immediately
            lastUpdateRef.current = now
            cachedDataRef.current = newData ?? null
            onStoreChange()
          } else {
            // Schedule throttled update
            if (!timeoutRef.current) {
              timeoutRef.current = setTimeout(() => {
                lastUpdateRef.current = Date.now()
                cachedDataRef.current =
                  useStore.getState().signalkData[context]?.[path$SourceKey] ??
                  null
                timeoutRef.current = null
                if (listenerRef.current) {
                  listenerRef.current()
                }
              }, THROTTLE_MS - elapsed)
            }
          }
        },
        { fireImmediately: true }
      )

      return () => {
        unsubscribe()
        listenerRef.current = null
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current)
          timeoutRef.current = null
        }
      }
    },
    [context, path$SourceKey]
  )

  const getSnapshot = useCallback(() => {
    // Initialize cachedDataRef if needed
    if (cachedDataRef.current === null) {
      cachedDataRef.current =
        useStore.getState().signalkData[context]?.[path$SourceKey] ?? null
    }
    return cachedDataRef.current
  }, [context, path$SourceKey])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/**
 * Hook to get metadata for a path from Zustand
 */
export function useMetaData(
  context: string,
  path: string | undefined
): MetaData | null {
  const metaData = useStore((s) =>
    path ? s.signalkMeta[context]?.[path] : undefined
  )
  return metaData ?? null
}

// Re-export types for convenience
export type { PathData, MetaData }
