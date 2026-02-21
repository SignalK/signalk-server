import { useState, useEffect } from 'react'

export function fetchSourcesData(): Promise<Record<string, unknown>> {
  return fetch('/signalk/v1/api/sources', {
    credentials: 'include'
  }).then((response) => response.json())
}

export function useSources(pollInterval = 30000): Record<string, unknown> {
  const [sources, setSources] = useState<Record<string, unknown>>({})

  useEffect(() => {
    let canceled = false

    const doFetch = () => {
      fetchSourcesData()
        .then((data) => {
          if (!canceled) {
            setSources(data)
          }
        })
        .catch(() => undefined)
    }

    doFetch()
    const interval =
      pollInterval > 0 ? setInterval(doFetch, pollInterval) : null

    return () => {
      canceled = true
      if (interval) clearInterval(interval)
    }
  }, [pollInterval])

  return sources
}
