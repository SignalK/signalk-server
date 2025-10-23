import React from 'react'
import { evaluateFormula} from '@signalk/formula-evaluator'

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

const VALUE_RENDERERS = {
  'navigation.position': PositionRenderer,
  'navigation.gnss.satellitesInView': SatellitesInViewRenderer
}

export const getValueRenderer = (path) => {
  if (VALUE_RENDERERS[path]) {
    return VALUE_RENDERERS[path]
  }

  return null
}

export const DefaultValueRenderer = ({ value, units, pathInfo }) => {
  let formattedValue = JSON.stringify(
    value,
    null,
    typeof value === 'object' && Object.keys(value || {}).length > 1 ? 2 : 0
  )

  if (typeof value === 'number' && units) {
    formattedValue = `${value} `
  }

  // Get conversion info if available
  let conversionInfo = null
  if (pathInfo && pathInfo.conversions && typeof value === 'number') {
    const conversions = pathInfo.conversions
    const conversionKeys = Object.keys(conversions)
    if (conversionKeys.length > 0) {
      const firstConversionKey = conversionKeys[0]
      const conversion = conversions[firstConversionKey]
      
      // Evaluate the formula to get the converted value
      let convertedValue = null
      try {
        convertedValue = evaluateFormula(conversion.formula, value)
      } catch (error) {
        console.error('Error evaluating conversion formula:', error)
      }
      
      conversionInfo = {
        name: firstConversionKey,
        formula: conversion.formula,
        convertedValue: convertedValue,
        symbol: conversion.symbol
      }
    }
  }

  

  return (
    <>
      {typeof value === 'object' ? (
        <pre className="text-primary">{formattedValue}</pre>
      ) : (
        <span className="text-primary">
          {formattedValue}
          {typeof value === 'number' && units && <strong>{units}</strong>}
          {conversionInfo && <> = {conversionInfo.convertedValue.toFixed(2)} {conversionInfo.symbol}</>}
        </span>
      )}
    </>
  )
}
