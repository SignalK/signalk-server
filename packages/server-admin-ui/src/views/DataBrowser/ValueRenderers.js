import React from 'react'
import { Suspense } from 'react'
import { toLazyDynamicComponent } from '../Webapps/dynamicutilities'
import ReactHtmlParser from 'react-html-parser'
import {
  faEye,
  faEyeSlash,
  faBell,
  faBellSlash
} from '@fortawesome/free-solid-svg-icons'

import '../../blinking-circle.css'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

function radiansToDegrees(radians) {
  return radians * (180 / Math.PI)
}
const SimpleHTMLRenderer = ({ value, html }) => {
  const h = html.replaceAll('{{value}}', value)
  return <div>{ReactHtmlParser(h)}</div>
}

const DirectionRenderer = ({ value, size = '1em' }) => {
  const traditionalCompassPoints = [
    'N',
    'N by E',
    'NNE',
    'NE by N',
    'NE',
    'NE by E',
    'ENE',
    'E by N',
    'E',
    'E by S',
    'ESE',
    'SE by E',
    'SE',
    'SE by S',
    'SSE',
    'S by E',
    'S',
    'S by W',
    'SSW',
    'SW by S',
    'SW',
    'SW by W',
    'WSW',
    'W by S',
    'W',
    'W by N',
    'WNW',
    'NW by W',
    'NW',
    'NW by N',
    'NNW',
    'N by W'
  ]

  const directionDegrees = radiansToDegrees(value)
  const compassPoint =
    traditionalCompassPoints[
      Math.round((((directionDegrees % 360) + 360) % 360) / 11.25) % 32
    ]
  const arrowStyle = {
    fontSize: size,
    fontWeight: 'bold',
    transition: 'transform 0.3s ease-out',

    transform: `rotate(${directionDegrees}deg) translateY(-2px)`,
    display: 'inline-block' // Required for rotation to work reliably
  }

  return (
    <div
      className="text-primary"
      style={{
        display: 'inline-flex'
      }}
    >
      <span
        style={arrowStyle}
        aria-label={`Wind direction: ${directionDegrees} degrees`}
      >
        &#x2191;
      </span>

      <span style={{ marginLeft: '.5em' }}>
        {directionDegrees.toFixed(2)}° {compassPoint}
      </span>
    </div>
  )
}
const AttitudeRenderer = ({ value, size = '2em' }) => {
  const pitch = radiansToDegrees(value.pitch || 0)
  const roll = radiansToDegrees(value.roll || 0)
  const horizonHeight = ((pitch + 90) / 180) * 100 + '%'
  const attitudeText = `pitch: ${pitch.toFixed(1)}° roll: ${roll.toFixed(1)}°`
  return (
    <div
      className="text-primary"
      style={{
        display: 'inline-flex'
      }}
    >
      <div
        style={{
          width: size,
          height: size,
          border: '2px solid black',
          borderRadius: '50%',
          overflow: 'hidden',
          position: 'relative'
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            backgroundColor: 'skyblue',
            position: 'absolute',
            transformOrigin: 'center',
            transform: `rotateZ(${roll}deg)`
          }}
        >
          <div
            style={{
              width: '100%',
              height: horizonHeight,
              backgroundColor: 'brown',
              position: 'absolute',
              bottom: 0
            }}
          ></div>
        </div>
      </div>
      <span className="text-primary" style={{ marginLeft: '.5em' }}>
        {attitudeText}
      </span>
    </div>
  )
}

const NotificationRenderer = ({ value }) => {
  const { message, state, method = [] } = value ? value : {}

  const severityColor =
    {
      info: 'green',
      normal: 'green',
      nominal: 'green',
      warn: 'yellow',
      alert: 'orange',
      alarm: 'red',
      emergency: 'darkred'
    }[state] || 'gray'

  const circleStyle = {
    width: '1em',
    height: '1em',
    borderRadius: '50%',
    backgroundColor: severityColor,
    display: 'inline-block',
    marginLeft: '.5em'
  }
  return (
    <div className="d-flex justify-content-between">
      <div className="d-flex" style={{ verticalAlign: 'middle' }}>
        {state === 'emergency' ? (
          <span className="blinking-circle"></span>
        ) : (
          <span style={circleStyle}></span>
        )}
        <span className="d-flex" style={{ marginLeft: '.5em' }}>
          {(state ? state.toUpperCase() : 'undefined') + ': ' + message}
        </span>
      </div>
      <div className="d-flex" style={{ gap: '.5em' }}>
        <FontAwesomeIcon
          icon={method.includes('visual') ? faEye : faEyeSlash}
        />
        <FontAwesomeIcon
          icon={method.includes('sound') ? faBell : faBellSlash}
        />
      </div>
    </div>
  )
}
const LargeArrayRenderer = ({ value }) => {
  if (!Array.isArray(value) || value.length <= 1) {
    return <span className="text-primary">{JSON.stringify(value)}</span>
  }
  return (
    <div className="text-primary">
      <details>
        <summary>
          {JSON.stringify(value[0])} 1 of {value.length}
        </summary>
        {JSON.stringify(value)}
      </details>
    </div>
  )
}

const MeterRenderer = ({
  value,
  min = 0,
  max = 1,
  low = 0.5,
  high = 1.01,
  optimum = 1,
  pct = true,
  precision = 2
}) => {
  const txt = (value * (pct ? 100 : 1)).toFixed(precision) + (pct ? '%' : '')

  return (
    <div className="text-primary">
      <meter
        value={value}
        min={min}
        max={max}
        low={low}
        high={high}
        optimum={optimum}
      >
        {value}%
      </meter>
      <span
        className="text-primary"
        style={{ verticalAlign: 'middle', marginLeft: '.5em' }}
      >
        {' '}
        {txt}
      </span>
    </div>
  )
}

const PositionRenderer = ({ value }) => {
  if (!value || typeof value !== 'object') {
    return <span className="text-primary">{JSON.stringify(value)}</span>
  }

  const { longitude, latitude } = value

  if (typeof longitude !== 'number' || typeof latitude !== 'number') {
    return <span className="text-primary">{JSON.stringify(value)}</span>
  }

  return (
    <span className="text-primary">
      longitude: {longitude}, latitude: {latitude}
    </span>
  )
}

const SatellitesInViewRenderer = ({ value }) => {
  if (!value || typeof value !== 'object' || !Array.isArray(value.satellites)) {
    return <span className="text-primary">{JSON.stringify(value)}</span>
  }

  const { count, satellites } = value
  const size = 200
  const center = size / 2
  const maxRadius = center - 20

  const getSNRColor = (snr) => {
    if (!snr || snr <= 0) return '#000'
    if (snr >= 40) return '#28a745'
    if (snr >= 30) return '#004085'
    return '#8b0000'
  }

  const polarToCartesian = (elevation, azimuth) => {
    const elevationRadius = maxRadius * (1 - elevation / (Math.PI / 2))
    const x = center + elevationRadius * Math.sin(azimuth)
    const y = center - elevationRadius * Math.cos(azimuth)
    return { x, y }
  }

  return (
    <div className="text-primary">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
        <svg width={size} height={size} style={{ border: '1px solid #ccc' }}>
          {/* Elevation circles (30° intervals) */}
          <circle
            cx={center}
            cy={center}
            r={maxRadius}
            fill="none"
            stroke="#e0e0e0"
            strokeWidth="1"
          />
          <circle
            cx={center}
            cy={center}
            r={(maxRadius * 2) / 3}
            fill="none"
            stroke="#e0e0e0"
            strokeWidth="1"
          />
          <circle
            cx={center}
            cy={center}
            r={(maxRadius * 1) / 3}
            fill="none"
            stroke="#e0e0e0"
            strokeWidth="1"
          />

          {/* Cardinal direction lines */}
          <line
            x1={center}
            y1={20}
            x2={center}
            y2={size - 20}
            stroke="#e0e0e0"
            strokeWidth="1"
          />
          <line
            x1={20}
            y1={center}
            x2={size - 20}
            y2={center}
            stroke="#e0e0e0"
            strokeWidth="1"
          />

          {/* Direction labels */}
          <text x={center} y={15} textAnchor="middle" fontSize="12" fill="#666">
            N
          </text>
          <text
            x={center}
            y={size - 5}
            textAnchor="middle"
            fontSize="12"
            fill="#666"
          >
            S
          </text>
          <text
            x={10}
            y={center + 4}
            textAnchor="middle"
            fontSize="12"
            fill="#666"
          >
            W
          </text>
          <text
            x={size - 10}
            y={center + 4}
            textAnchor="middle"
            fontSize="12"
            fill="#666"
          >
            E
          </text>

          {/* Elevation angle labels */}
          <text
            x={center + maxRadius + 5}
            y={center + 4}
            fontSize="10"
            fill="#999"
          >
            0°
          </text>
          <text
            x={center + (maxRadius * 2) / 3 + 5}
            y={center + 4}
            fontSize="10"
            fill="#999"
          >
            30°
          </text>
          <text
            x={center + (maxRadius * 1) / 3 + 5}
            y={center + 4}
            fontSize="10"
            fill="#999"
          >
            60°
          </text>
          <text x={center + 5} y={center + 4} fontSize="10" fill="#999">
            90°
          </text>

          {/* Satellites */}
          {satellites.map((sat) => {
            const { x, y } = polarToCartesian(sat.elevation, sat.azimuth)
            const color = getSNRColor(sat.SNR)
            const hasSignal = sat.SNR && sat.SNR > 0
            const snrText = sat.SNR ? `${sat.SNR} dB` : 'No signal'

            return (
              <g key={sat.id}>
                <title>
                  Satellite {sat.id}: {snrText}
                </title>
                <circle
                  cx={x}
                  cy={y}
                  r="8"
                  fill={color}
                  stroke={hasSignal ? 'none' : '#000'}
                  strokeWidth={hasSignal ? 0 : 2}
                />
                <text
                  x={x}
                  y={y + 4}
                  textAnchor="middle"
                  fontSize="10"
                  fill="white"
                  fontWeight="bold"
                >
                  {sat.id}
                </text>
              </g>
            )
          })}
        </svg>

        {/* Info and Legend */}
        <div style={{ fontSize: '12px', minWidth: '80px' }}>
          <div style={{ marginBottom: '12px' }}>
            <strong>Satellites in view: {count}</strong>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div
                style={{
                  width: '12px',
                  height: '12px',
                  backgroundColor: '#28a745',
                  borderRadius: '50%'
                }}
              ></div>
              <span>≥40 dB</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div
                style={{
                  width: '12px',
                  height: '12px',
                  backgroundColor: '#004085',
                  borderRadius: '50%'
                }}
              ></div>
              <span>30-40 dB</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div
                style={{
                  width: '12px',
                  height: '12px',
                  backgroundColor: '#8b0000',
                  borderRadius: '50%'
                }}
              ></div>
              <span>0-30 dB</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div
                style={{
                  width: '12px',
                  height: '12px',
                  backgroundColor: '#000',
                  border: '2px solid #000',
                  borderRadius: '50%'
                }}
              ></div>
              <span>No signal</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export const getValueRenderer = (path, meta) => {
  if (path.startsWith('notifications.')) {
    return NotificationRenderer // notification paths should always use NotificationRenderer
    // better implementation would set up regex path -> renderer mapping in settings file
    // even better implementation would be to have first class object types like Notification,
    // Battery, Sensor, Engine, GPS etc. that encapsulate their paths and their renderer
    // as well as other useful data/behavior.
  }
  if (meta && meta.renderer && meta.renderer.module) {
    if (Renderers[`${meta.renderer.module}.${meta.renderer.name}`]) {
      return Renderers[`${meta.renderer.module}.${meta.renderer.name}`]
    } else {
      const Renderer = toLazyDynamicComponent(
        meta.renderer.module,
        meta.renderer.name
      )

      const comp = function component(props) {
        return (
          <div>
            <Suspense fallback={<DefaultValueRenderer {...props} />}>
              <Renderer {...props} />
            </Suspense>
          </div>
        )
      }
      Renderers[`${meta.renderer.module}.${meta.renderer.name}`] = comp
      return comp
    }
  }

  if (meta && meta.renderer) {
    return Renderers[meta.renderer.name]
  }
  if (meta && meta.units === 'ratio') {
    return MeterRenderer
  }

  if (VALUE_RENDERERS[path]) {
    return VALUE_RENDERERS[path]
  }

  return null
}

export const DefaultValueRenderer = ({
  value,
  units,
  convertedValue,
  convertedUnit
}) => {
  let formattedValue = JSON.stringify(
    value,
    null,
    typeof value === 'object' && Object.keys(value || {}).length > 1 ? 2 : 0
  )

  if (typeof value === 'number') {
    // Format numbers nicely: integers stay as-is, decimals get 2 decimal places
    formattedValue = Number.isInteger(value)
      ? value.toString()
      : value.toFixed(2)
  }

  // Format converted value
  let formattedConverted = null
  if (convertedValue !== null && convertedValue !== undefined) {
    formattedConverted = Number.isInteger(convertedValue)
      ? convertedValue.toString()
      : convertedValue.toFixed(2)
  }

  return (
    <>
      {typeof value === 'object' ? (
        <pre className="text-primary">{formattedValue}</pre>
      ) : (
        <span className="text-primary">
          {formattedValue}
          {typeof value === 'number' && units && <strong> {units}</strong>}
          {formattedConverted && convertedUnit && (
            <span style={{ color: '#28a745', marginLeft: '8px' }}>
              ({formattedConverted} <strong>{convertedUnit}</strong>)
            </span>
          )}
        </span>
      )}
    </>
  )
}

const Renderers = {
  Position: PositionRenderer,
  SatellitesInView: SatellitesInViewRenderer,
  Meter: MeterRenderer,
  SimpleHTML: SimpleHTMLRenderer,
  LargeArray: LargeArrayRenderer,
  Notification: NotificationRenderer,
  Attitude: AttitudeRenderer,
  Direction: DirectionRenderer
}

const VALUE_RENDERERS = {
  'navigation.position': Renderers.Position,
  'navigation.gnss.satellitesInView': Renderers.SatellitesInView
}
