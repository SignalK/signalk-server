import React from 'react'
import DepthSensorSettings from './DepthSensorSettings'
import GnssPositionSettings from './GnssPositionSettings'
import UnitPreferencesSettings from './UnitPreferencesSettings'

const PreferencesPage: React.FC = () => {
  return (
    <div className="animated fadeIn">
      <GnssPositionSettings />
      <DepthSensorSettings />
      <UnitPreferencesSettings />
    </div>
  )
}

export default PreferencesPage
