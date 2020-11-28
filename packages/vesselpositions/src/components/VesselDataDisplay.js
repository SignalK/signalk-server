import React from 'react'

import { Polyline, withLeaflet } from 'react-leaflet'
import { useObservableState } from 'observable-hooks'
import { SVGMarker } from './CustomMarker'

const VesselDataDisplay = (props) => {
  const { vesselData } = props
  const position = useObservableState(vesselData.positionSubject)
  const heading = useObservableState(vesselData.headingSubject)
  const track = useObservableState(vesselData.uptodateTrack, [])
  const name = useObservableState(vesselData.nameSubject)
  return (
    <span>
      {position && <SVGMarker position={position} course={heading} name={name} {...props}/>}
      {track.length > 0 && <Polyline positions={track} color='blue' />}
    </span>)
}

export default withLeaflet(VesselDataDisplay)