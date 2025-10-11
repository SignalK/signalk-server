import React from 'react'

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

const VALUE_RENDERERS = {
  'navigation.position': PositionRenderer
}

export const getValueRenderer = (path) => {
  if (VALUE_RENDERERS[path]) {
    return VALUE_RENDERERS[path]
  }

  return null
}

export const DefaultValueRenderer = ({ value, units }) => {
  let formattedValue = JSON.stringify(
    value,
    null,
    typeof value === 'object' && Object.keys(value || {}).length > 1 ? 2 : 0
  )

  if (typeof value === 'number' && units) {
    formattedValue = `${value} `
  }

  return (
    <>
      {typeof value === 'object' ? (
        <pre className="text-primary">{formattedValue}</pre>
      ) : (
        <span className="text-primary">
          {formattedValue}
          {typeof value === 'number' && units && <strong>{units}</strong>}
        </span>
      )}
    </>
  )
}
