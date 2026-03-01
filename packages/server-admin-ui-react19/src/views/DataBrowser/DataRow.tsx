import { useMemo } from 'react'
import { usePathData, useMetaData } from './usePathData'
import TimestampCell from './TimestampCell'
import CopyToClipboardWithFade from './CopyToClipboardWithFade'
import SourceLabel from './SourceLabel'
import { getValueRenderer, DefaultValueRenderer } from './ValueRenderers'
import {
  usePresetDetails,
  useUnitDefinitions,
  useDefaultCategories
} from '../../store'
import type { PathData, MetaData } from '../../store'
import { convertValue } from '../../utils/unitConversion'
import type { DefaultCategories } from '../../store/slices/unitPreferencesSlice'
import type { SourcesData } from '../../utils/sourceLabels'

interface DataRowProps {
  path$SourceKey: string
  context: string
  index: number
  raw: boolean
  isPaused: boolean
  showContext: boolean
  sourceCountsByPath: Map<string, number>
  sourcesData: SourcesData | null
  configuredPriorityPaths: Set<string>
}

interface ValueRendererProps {
  data: PathData
  meta: MetaData | null
  units: string
  raw: boolean
  convertedValue?: number | null
  convertedUnit?: string | null
}

/**
 * Find category for a path by checking wildcard patterns in default categories
 */
function findCategoryForPath(
  path: string,
  defaultCategories: DefaultCategories
): string | null {
  if (!path || !defaultCategories) return null

  for (const [category, config] of Object.entries(defaultCategories)) {
    if (config.paths && Array.isArray(config.paths)) {
      for (const pattern of config.paths) {
        const regex = new RegExp(
          '^' + pattern.replace(/\*/g, '[^.]+').replace(/\./g, '\\.') + '$'
        )
        if (regex.test(path)) {
          return category
        }
      }
    }
  }
  return null
}

function DataRow({
  path$SourceKey,
  context,
  index,
  raw,
  isPaused,
  showContext,
  sourceCountsByPath,
  sourcesData,
  configuredPriorityPaths
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

  const presetDetails = usePresetDetails()
  const unitDefinitions = useUnitDefinitions()
  const defaultCategories = useDefaultCategories()

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

  let category =
    (meta as Record<string, unknown> | null)?.displayUnits &&
    typeof (meta as Record<string, unknown>).displayUnits === 'object'
      ? ((
          (meta as Record<string, unknown>).displayUnits as Record<
            string,
            unknown
          >
        )?.category as string | undefined)
      : undefined
  if (!category && data?.path && defaultCategories) {
    category = findCategoryForPath(data.path, defaultCategories) ?? undefined
  }

  let convertedValue: number | null = null
  let convertedUnit: string | null = null
  if (category && typeof data.value === 'number') {
    const converted = convertValue(
      data.value,
      units,
      category,
      presetDetails,
      unitDefinitions
    )
    if (converted && converted.unit !== units) {
      convertedValue = converted.value
      convertedUnit = converted.unit
    }
  }

  const path = data.path ?? ''
  const source = data.$source ?? ''
  const timestamp = data.timestamp ?? ''
  const sourceCount = path ? sourceCountsByPath.get(path) || 1 : 1

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
        <ValueRenderer
          data={data}
          meta={meta}
          units={units}
          raw={raw}
          convertedValue={convertedValue}
          convertedUnit={convertedUnit}
        />
      </div>

      <TimestampCell timestamp={timestamp} isPaused={isPaused} />

      <div className="virtual-table-cell source-cell" data-label="Source">
        <CopyToClipboardWithFade text={source}>
          <SourceLabel sourceRef={source} sourcesData={sourcesData} />{' '}
          <span className="copy-icon" aria-hidden="true" />
        </CopyToClipboardWithFade>{' '}
        {data.pgn && <span>&nbsp;{data.pgn}</span>}
        {data.sentence && <span>&nbsp;{data.sentence}</span>}
        {sourceCount > 1 && !configuredPriorityPaths.has(path) && (
          <a
            href={`#/data/priorities?path=${encodeURIComponent(path)}`}
            style={{
              marginLeft: '4px',
              fontSize: '0.7em',
              color: 'var(--bs-danger, #d9534f)',
              fontWeight: 600,
              textDecoration: 'none'
            }}
            title={`${sourceCount} sources — no priority configured. Click to configure.`}
          >
            &#9888; 1/{sourceCount}
          </a>
        )}
      </div>
    </div>
  )
}

// ValueRenderer uses dynamic component selection for plugin extensibility.
// getValueRenderer returns cached components from a module-level registry.
// The first access per renderer type creates and caches the component,
// subsequent accesses return the cached reference. This pattern is intentional
// for supporting dynamically loaded renderers from plugins.
function ValueRenderer({
  data,
  meta,
  units,
  raw,
  convertedValue,
  convertedUnit
}: ValueRendererProps) {
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
        convertedValue={convertedValue}
        convertedUnit={convertedUnit}
        {...(meta?.renderer?.options ?? {})}
      />
    )
  }

  return (
    <DefaultValueRenderer
      value={data.value}
      units={units}
      convertedValue={convertedValue}
      convertedUnit={convertedUnit}
    />
  )
}

export default DataRow
