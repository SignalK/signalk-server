import React, { useEffect } from 'react'
import Alert from 'react-bootstrap/Alert'
import { useStore, useUnitPrefsLoaded } from '../store'

const RETRY_DELAY_MS = 2000
const MAX_RETRY_DELAY_MS = 60000

const UnitPreferencesLoadNotice: React.FC = () => {
  const loaded = useUnitPrefsLoaded()
  const failedLoads = useStore((s) => s.unitPrefsFailedLoads)
  const fetchUnitPreferences = useStore((s) => s.fetchUnitPreferences)

  useEffect(() => {
    if (!loaded) {
      fetchUnitPreferences()
    }
  }, [loaded, fetchUnitPreferences])

  // Each failed load changes the count, which schedules the next retry.
  useEffect(() => {
    if (!failedLoads) {
      return
    }
    const timer = setTimeout(
      fetchUnitPreferences,
      Math.min(RETRY_DELAY_MS * 2 ** (failedLoads - 1), MAX_RETRY_DELAY_MS)
    )
    return () => clearTimeout(timer)
  }, [failedLoads, fetchUnitPreferences])

  return failedLoads ? (
    <Alert variant="warning">
      The unit preferences didn&apos;t load. Trying again.
    </Alert>
  ) : null
}

export default UnitPreferencesLoadNotice
