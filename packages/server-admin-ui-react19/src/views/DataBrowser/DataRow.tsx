import { useMemo } from 'react'
import { usePathData, useMetaData } from './usePathData'
import TimestampCell from './TimestampCell'
import CopyToClipboardWithFade from './CopyToClipboardWithFade'
import { getValueRenderer, DefaultValueRenderer } from './ValueRenderers'
import { getSourceDisplayLabel } from '../../hooks/sourceLabelUtils'
import type { PathData, MetaData } from '../../store'

interface DataRowProps {
  path$SourceKey: string
  context: string
  index: number
  raw: boolean
  isPaused: boolean
  onToggleSource: (source: string) => void
  selectedSources: Set<string>
  showContext: boolean
  sources: Record<string, unknown>
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
  selectedSources,
  showContext,
  sources
}: DataRowProps) {
  // When showContext is true, path$SourceKey is a composite key: context\0realKey
  const nullIdx = showContext ? path$SourceKey.indexOf('\0') : -1
  const realContext = nullIdx >= 0 ? path$SourceKey.slice(0, nullIdx) : context
  const realKey =
    nullIdx >= 0 ? path$SourceKey.slice(nullIdx + 1) : path$SourceKey

  const data = usePathData(realContext, realKey)
  const meta = useMetaData(realContext, data?.path)

  const contextNameData = usePathData(realContext, 'name')
  const contextLabel = showContext
    ? contextNameData?.value
      ? String(contextNameData.value)
      : realContext
    : ''

  if (!data) {
    return (
      <div
        className={`virtual-table-row ${index % 2 ? 'striped' : ''}`}
        data-raw-row={raw ? 'true' : undefined}
      >
        <div className="virtual-table-cell path-cell" data-label="Path">
          Loading...
        </div>
        {showContext && (
          <div
            className="virtual-table-cell context-cell"
            data-label="Context"
          ></div>
        )}
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

      {showContext && (
        <div className="virtual-table-cell context-cell" data-label="Context">
          {contextLabel}
        </div>
      )}

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
          {getSourceDisplayLabel(source, sources)}{' '}
          <span className="copy-icon" aria-hidden="true" />
        </CopyToClipboardWithFade>{' '}
        {data.pgn && <span>&nbsp;{data.pgn}</span>}
        {data.sentence && <span>&nbsp;{data.sentence}</span>}
      </div>
    </div>
  )
}

// ValueRenderer uses dynamic component selection for plugin extensibility.
// getValueRenderer returns cached components from a module-level registry.
// The first access per renderer type creates and caches the component,
// subsequent accesses return the cached reference. This pattern is intentional
// for supporting dynamically loaded renderers from plugins.
function ValueRenderer({ data, meta, units, raw }: ValueRendererProps) {
  // Get the renderer component - memoized to prevent recreating on every render
  const rendererInfo = useMemo(() => {
    if (raw) return { type: 'raw' as const }
    const Renderer = getValueRenderer(data.path ?? '', meta)
    if (Renderer) return { type: 'custom' as const, Renderer }
    return { type: 'default' as const }
  }, [raw, data.path, meta])

  if (rendererInfo.type === 'raw') {
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

  if (rendererInfo.type === 'custom') {
    const Renderer = rendererInfo.Renderer
    return (
      <Renderer
        value={data.value}
        units={units}
        {...(meta?.renderer?.options ?? {})}
      />
    )
  }

  return <DefaultValueRenderer value={data.value} units={units} />
}

export default DataRow
