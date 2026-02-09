import { useRef, useSyncExternalStore, useCallback } from 'react'
import { useStore } from '../../store'
import type { PathData, MetaData } from '../../store'

const THROTTLE_MS = 200 // max 5 UI re-renders per second per path

export function usePathData(
  context: string,
  path$SourceKey: string
): PathData | null {
  const lastUpdateRef = useRef<number>(0)
  const cachedDataRef = useRef<PathData | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const listenerRef = useRef<(() => void) | null>(null)

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      listenerRef.current = onStoreChange

      const unsubscribe = useStore.subscribe(
        (state) => state.signalkData[context]?.[path$SourceKey],
        (newData) => {
          const now = Date.now()
          const elapsed = now - lastUpdateRef.current

          if (elapsed >= THROTTLE_MS) {
            lastUpdateRef.current = now
            cachedDataRef.current = newData ?? null
            onStoreChange()
          } else {
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
    if (cachedDataRef.current === null) {
      cachedDataRef.current =
        useStore.getState().signalkData[context]?.[path$SourceKey] ?? null
    }
    return cachedDataRef.current
  }, [context, path$SourceKey])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function useMetaData(
  context: string,
  path: string | undefined
): MetaData | null {
  const metaData = useStore((s) =>
    path ? s.signalkMeta[context]?.[path] : undefined
  )
  return metaData ?? null
}

export type { PathData, MetaData }
