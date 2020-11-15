import React from 'react'
import ReactDOMServer from 'react-dom/server'
import { Marker as LeafletMarker, Icon as LeafletIcon, DivIcon } from 'leaflet'
import { MapLayer } from 'react-leaflet'
import { withLeaflet } from 'react-leaflet'

export class SVGMarker extends MapLayer {
  createLeafletElement(props) {
    const options = this.getOptions({
      ...props, icon: divIcon(props)
    });
    this.el = new LeafletMarker(props.position, options);
    return this.el;
  }

  updateLeafletElement(fromProps, toProps) {
    if (fromProps.position != toProps.position) {
      this.el.setLatLng(toProps.position)
    }
    if (fromProps.name != toProps.name || fromProps.course != toProps.course) {
      this.el.setIcon(divIcon(toProps))
    }
  }
}

const divIcon = (props) => {
  return new DivIcon({
    className: 'custom-icon', //suppress default icon white box
    iconAnchor: [25,25],
    html: ReactDOMServer.renderToString(<SVGIcon course={props.course} name={props.name}/>)
  })
}

const SVGIcon = (props) => (
  <svg width="100px" height="50px" viewBox="-50 -50 200 100">
    <g transform={`rotate(${deg(props.course)})`}>
    <circle r="2" stroke="black" />
    <polygon points="0 -25, 10 15, -10 15" fill="none" strokeWidth="2" stroke="black" />
    </g>
    <g>
      <text x='10'>
        {props.name ? props.name : ''}
      </text>
    </g>
  </svg>
)

const deg = (r) => r / Math.PI * 180


export default withLeaflet(SVGMarker);