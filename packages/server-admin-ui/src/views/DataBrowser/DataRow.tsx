import { memo } from 'react'
import { usePathData, useMetaData } from './usePathData'
import TimestampCell from './TimestampCell'
import CopyToClipboardWithFade from './CopyToClipboardWithFade'
import { getValueRenderer, DefaultValueRenderer } from './ValueRenderers'
import { PathData, MetaData } from './ValueEmittingStore'

interface DataRowProps {
  path$SourceKey: string
  context: string
  index: number
  raw: boolean
  isPaused: boolean
  onToggleSource: (source: string) => void
  selectedSources: Set<string>
}

interface ValueRendererProps {
  data: PathData
  meta: MetaData | null
  units: string
  raw: boolean
}

/**
 * DataRow - Individual virtualized row with granular subscription
 * Only re-renders when THIS path's data changes
 */
function DataRow({
  path$SourceKey,
  context,
  index,
  raw,
  isPaused,
  onToggleSource,
  selectedSources
}: DataRowProps) {
  const data = usePathData(context, path$SourceKey)
  const meta = useMetaData(context, data?.path)

  if (!data) {
    return (
      <div className={`virtual-table-row ${index % 2 ? 'striped' : ''}`}>
        <div className="virtual-table-cell path-cell" data-label="Path">
          Loading...
        </div>
        <div className="virtual-table-cell value-cell" data-label="Value"></div>
        <div
          className="virtual-table-cell timestamp-cell"
          data-label="Time"
        ></div>
        <div
          className="virtual-table-cell source-cell"
          data-label="Source"
        ></div>
      </div>
    )
  }

  const units = meta && meta.units ? meta.units : ''

  return (
    <div className={`virtual-table-row ${index % 2 ? 'striped' : ''}`}>
      {/* Path Cell */}
      <div className="virtual-table-cell path-cell" data-label="Path">
        <CopyToClipboardWithFade text={data.path}>
          <span>
            {data.path} <i className="far fa-copy"></i>
          </span>
        </CopyToClipboardWithFade>
      </div>

      {/* Value Cell */}
      <div className="virtual-table-cell value-cell" data-label="Value">
        <ValueRenderer data={data} meta={meta} units={units} raw={raw} />
      </div>

      {/* Timestamp Cell */}
      <TimestampCell timestamp={data.timestamp} isPaused={isPaused} />

      {/* Source Cell */}
      <div className="virtual-table-cell source-cell" data-label="Source">
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
        </CopyToClipboardWithFade>
        {data.pgn && <span>&nbsp;{data.pgn}</span>}
        {data.sentence && <span>&nbsp;{data.sentence}</span>}
      </div>
    </div>
  )
}

/**
 * ValueRenderer - Renders the value with appropriate renderer
 */
function ValueRenderer({ data, meta, units, raw }: ValueRendererProps) {
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

export default memo(DataRow)
