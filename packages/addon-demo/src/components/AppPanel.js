import React, { useEffect, useState } from 'react'
import { Map, Marker, TileLayer } from 'react-leaflet'
import * as lh from './leaflet-hack'

const APPLICATION_DATA_VERSION = '1.0'

const AppPanel = (props) => {
  if (props.loginStatus.status === 'notLoggedIn' && props.loginStatus.authenticationRequired) {
    return <props.adminUI.Login />
  }

  props.adminUI.hideSideBar()

  const [applicationData, setApplicationData] = useState({ markers: [] })
  useEffect(() => {
    props.adminUI.getApplicationUserData(APPLICATION_DATA_VERSION).then(appData => {
      setApplicationData(appData)
    })
  }, [])

  return (
    <Map
      style={{ height: '100%' }}
      center={[60.1, 25]}
      zoom={10}
      onClick={(e) => {
        const markers = [...applicationData.markers || []]
        markers.push(e.latlng)
        const appData = { ...applicationData, markers }
        props.adminUI.setApplicationUserData(APPLICATION_DATA_VERSION, appData)
          .then(() => {
            setApplicationData(appData)
          })
      }}
    >
      <TileLayer
        attribution='&amp;copy <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />  )
      {(applicationData.markers || []).map((latlon, i) => (
        <Marker key={i} position={latlon} onClick={() => {
          const markers = applicationData.markers.slice()
          markers.splice(i, 1)
          const appData = { ...applicationData, markers }
          props.adminUI.setApplicationUserData(APPLICATION_DATA_VERSION, appData).then(() => setApplicationData(appData))
        }} />
      ))}
    </Map>
  )
}

export default AppPanel
