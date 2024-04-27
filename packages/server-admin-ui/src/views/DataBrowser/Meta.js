import React from 'react'
import JSONTree from 'react-json-tree'

const METAFIELDS = [
  'units',
  'description',
  'displayName',
  'longName',
  'shortName',
  'timeout',
  'displayScale',
  'zones',
  'normalMethod',
  'nominalMethod',
  'alertMethod',
  'warnMethod',
  'alarmMethod',
  'emergencyMethod',
]

export default function Meta({ meta }) {
  let metaValues = METAFIELDS.reduce((acc, key) => {
    if (meta[key]) {
      acc.push({ key, value: meta[key] })
    }
    return acc
  }, [])
  Object.keys(meta).reduce((acc, key) => {
    if (METAFIELDS.indexOf(key) < 0) {
      acc.push({ key, value: meta[key] })
    }
    return acc
  }, metaValues)
  const extraValues = clone(meta)
  for (const prop in extraValues) {
    if (METAFIELDS.indexOf(prop) < 0) {
      delete extraValues[prop]
    }
  }
  return (
    <>
      <ul>
        {metaValues.map(({ key, value }) => (
          <li key={key}>
            {key !== 'zones' && (
              <>
                {key}:
                {typeof value === 'object' ? (
                  <JSONTree
                    data={value}
                    theme="default"
                    sortObjectKeys
                    hideRoot
                  />
                ) : (
                  value
                )}
              </>
            )}
            {key === 'zones' && <Zones zones={value}></Zones>}
          </li>
        ))}
      </ul>
    </>
  )
}

const Zones = ({zones}) => (
  <>
  zones
  <ul>
    {zones.map((zone, i) => (
      <li key={i}>
        <JSONTree data={zone} theme="default" hideRoot></JSONTree>
      </li>
    ))}
  </ul>
  </>
)

const clone = (o) => JSON.parse(JSON.stringify(o))
