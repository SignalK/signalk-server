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
      <div
        className={`virtual-table-row ${index % 2 ? 'striped' : ''}`}
        data-raw-row={raw ? 'true' : undefined}
      >
        <div className="virtual-table-cell path-cell" data-label="Path">Loading...</div>
        <div className="virtual-table-cell value-cell" data-label="Value"></div>
        <div className="virtual-table-cell timestamp-cell" data-label="Time"></div>
        <div className="virtual-table-cell source-cell" data-label="Source"></div>
      </div>
    )
  }

  const units = meta && meta.units ? meta.units : ''

  const path = data.path ?? ''
  const source = data.$source ?? ''
  const timestamp = data.timestamp ?? ''

  return (
    <div
      className={`virtual-table-row ${index % 2 ? 'striped' : ''}`}
      data-raw-row={raw ? 'true' : undefined}
    >
      <div className="virtual-table-cell path-cell" data-label="Path">
        <CopyToClipboardWithFade text={path}>
          <span>
            {path} <span className="copy-icon" aria-hidden="true" />
          </span>
        </CopyToClipboardWithFade>
      </div>

      <div className="virtual-table-cell value-cell" data-label="Value">
        <ValueRenderer data={data} meta={meta} units={units} raw={raw} />
      </div>

      <TimestampCell timestamp={timestamp} isPaused={isPaused} />

      <div className="virtual-table-cell source-cell" data-label="Source">
        <label style={{ display: 'inline', cursor: 'pointer' }}>
          <input
            type="checkbox"
            onChange={() => onToggleSource(source)}
            checked={selectedSources.has(source)}
            aria-label={`Select source ${source}`}
            style={{
              marginRight: '5px',
              verticalAlign: 'middle'
            }}
          />
        </label>
        <CopyToClipboardWithFade text={source}>
          {source} <span className="copy-icon" aria-hidden="true" />
        </CopyToClipboardWithFade>{' '}
        {data.pgn || ''}
        {data.sentence || ''}
      </div>
    </div>
  )
}

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

  const CustomRenderer = getValueRenderer(data.path ?? '', meta)
  if (CustomRenderer) {
    return (
      <CustomRenderer
        value={data.value}
        units={units}
        {...(meta?.renderer?.options ?? {})}
      />
    )
  }

  return <DefaultValueRenderer value={data.value} units={units} />
}

export default DataRow
