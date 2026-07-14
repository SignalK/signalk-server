import React from 'react'
import GnssPositionSettings from './GnssPositionSettings'
import UnitPreferencesSettings from './UnitPreferencesSettings'
import HistoryProviderSettings from './HistoryProviderSettings'

const PreferencesPage: React.FC = () => {
  return (
    <div className="animated fadeIn">
      <GnssPositionSettings />
      <UnitPreferencesSettings />
      <HistoryProviderSettings />
    </div>
  )
}

export default PreferencesPage
