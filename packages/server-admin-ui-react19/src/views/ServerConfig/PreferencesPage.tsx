import React from 'react'
import GpsPositionSettings from './GpsPositionSettings'
import UnitPreferencesSettings from './UnitPreferencesSettings'

const PreferencesPage: React.FC = () => {
  return (
    <div className="animated fadeIn">
      <GpsPositionSettings />
      <UnitPreferencesSettings />
    </div>
  )
}

export default PreferencesPage
