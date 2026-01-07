import React from 'react'
import { usePathData, useMetaData } from './usePathData'
import TimestampCell from './TimestampCell'
import CopyToClipboardWithFade from './CopyToClipboardWithFade'
import { getValueRenderer, DefaultValueRenderer } from './ValueRenderers'

/**
 * DataRow - Individual virtualized row with granular subscription
 * Only re-renders when THIS path's data changes
 */
function DataRow({
  pathKey,
  context,
  index,
  raw,
  isPaused,
  onToggleSource,
  selectedSources
}) {
  const data = usePathData(context, pathKey)
  const meta = useMetaData(context, data?.path)

  if (!data) {
    return (
      <div className={`virtual-table-row ${index % 2 ? 'striped' : ''}`}>
        <div className="virtual-table-cell path-cell">Loading...</div>
        <div className="virtual-table-cell value-cell"></div>
        <div className="virtual-table-cell timestamp-cell"></div>
        <div className="virtual-table-cell source-cell"></div>
      </div>
    )
  }

  const units = meta && meta.units ? meta.units : ''

  return (
    <div className={`virtual-table-row ${index % 2 ? 'striped' : ''}`}>
      {/* Path Cell */}
      <div className="virtual-table-cell path-cell">
        <CopyToClipboardWithFade text={data.path}>
          <span>
            {data.path} <i className="far fa-copy"></i>
          </span>
        </CopyToClipboardWithFade>
      </div>

      {/* Value Cell */}
      <div className="virtual-table-cell value-cell">
        <ValueRenderer data={data} meta={meta} units={units} raw={raw} />
      </div>

      {/* Timestamp Cell */}
      <TimestampCell timestamp={data.timestamp} isPaused={isPaused} />

      {/* Source Cell */}
      <div className="virtual-table-cell source-cell">
        <input
          type="checkbox"
          onChange={() => onToggleSource(data.$source)}
          checked={selectedSources.has(data.$source)}
          aria-label={`Select source ${data.$source}`}
          style={{
            marginRight: '5px',
            verticalAlign: 'middle'
          }}
        />
        <CopyToClipboardWithFade text={data.$source}>
          {data.$source} <i className="far fa-copy"></i>
        </CopyToClipboardWithFade>{' '}
        {data.pgn || ''}
        {data.sentence || ''}
      </div>
    </div>
  )
}

/**
 * ValueRenderer - Renders the value with appropriate renderer
 */
function ValueRenderer({ data, meta, units, raw }) {
  if (raw) {
    return (
      <div>
        <div className="text-primary">
          value: {JSON.stringify(data.value, null, 2)}
        </div>
        <div className="text-primary">
          meta: {JSON.stringify(meta ? meta : {}, null, 2)}
        </div>
      </div>
    )
  }

  const CustomRenderer = getValueRenderer(data.path, meta)
  if (CustomRenderer) {
    return (
      <CustomRenderer
        value={data.value}
        units={units}
        {...(meta?.renderer?.options || {})}
      />
    )
  }

  return <DefaultValueRenderer value={data.value} units={units} />
}

export default React.memo(DataRow)
