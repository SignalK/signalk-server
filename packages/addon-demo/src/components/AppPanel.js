import React from 'react'
import { Map, TileLayer } from 'react-leaflet'

import './leaflet.css'

const AppPanel = (props) => {
  props.adminUI.hideSideBar()

  if (props.loginStatus.status === 'notLoggedIn' && props.loginStatus.authenticationRequired) {
    return <props.adminUI.Login />
  }

  return (
    <Map style={{ height: '100%' }} center={[60.1, 25]} zoom={10}>
      <TileLayer
        attribution='&amp;copy <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />  )
    </Map>
  )
}

export default AppPanel
