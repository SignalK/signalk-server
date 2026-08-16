import { useMemo } from 'react'
import Badge from 'react-bootstrap/Badge'
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
import {
  canonicaliseSourceRef,
  type SourcesData
} from '../../utils/sourceLabels'

interface DataRowProps {
  path$SourceKey: string
  context: string
  index: number
  raw: boolean
  isPaused: boolean
  showContext: boolean
  /**
   * True when the user is in 'Priority filtered' mode. Switches the
   * X/Y badge from informational ("you have N sources") in 'All
   * sources' mode to a "no priority configured" warning in
   * 'Priority filtered' mode.
   */
  sourceFilter: boolean
  sourceCountsByPath: Map<string, number>
  sourcesData: SourcesData | null
  configuredPriorityPaths: Set<string>
  /**
   * Paths the priority engine is currently routing for this context
   * (i.e. has a live winner for). Includes paths covered by group
   * rankings, not just path-level overrides.
   * configuredPriorityPaths only tracks the latter, so it would emit
   * a "no priority configured" warning for group-routed paths even
   * though the engine is honouring them.
   */
  routedPaths?: Set<string>
  preferredSourceByPath?: Map<string, string>
  /**
   * Paths the user has flagged for fan-out (sentinel '*' override).
   * The "Preferred" badge is suppressed for these because every source
   * is intentionally delivered — no row is "the" winner.
   */
  fanOutPaths?: Set<string>
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
  sourceFilter,
  sourceCountsByPath,
  sourcesData,
  configuredPriorityPaths,
  routedPaths,
  preferredSourceByPath,
  fanOutPaths
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

  const displayUnits =
    (meta as Record<string, unknown> | null)?.displayUnits &&
    typeof (meta as Record<string, unknown>).displayUnits === 'object'
      ? ((meta as Record<string, unknown>).displayUnits as {
          targetUnit?: string
          formula?: string
          symbol?: string
        })
      : undefined

  const convertIfNumeric = (
    rawValue: unknown
  ): { value: number | null; unit: string | null } => {
    if (!category || typeof rawValue !== 'number') {
      return { value: null, unit: null }
    }
    const converted = convertValue(
      rawValue,
      units,
      category,
      presetDetails,
      unitDefinitions,
      displayUnits
    )
    return converted && converted.unit !== units
      ? { value: converted.value, unit: converted.unit }
      : { value: null, unit: null }
  }

  const { value: convertedValue, unit: convertedUnit } = convertIfNumeric(
    data.value
  )

  // The last good value displayed under a timed-out row gets the same
  // unit conversion as the current value, so a user who reads SOG in
  // knots doesn't suddenly see m/s in the "last:" line.
  const { value: lastConvertedValue, unit: lastConvertedUnit } =
    data.state?.timedOut && data.state.lastValue !== undefined
      ? convertIfNumeric(data.state.lastValue.value)
      : { value: null, unit: null }

  const path = data.path ?? ''
  const source = data.$source ?? ''
  const timestamp = data.timestamp ?? ''
  // The count map is keyed per (context, path) in ALL mode and per
  // bare path in single-context mode; rebuild the same key shape here
  // so a self-vessel row's "X/Y" reflects only the self-vessel's
  // sources, not AIS or other-vessel rows that share the path.
  const countKey = showContext ? `${realContext}\0${path}` : path
  const sourceCount = path ? sourceCountsByPath.get(countKey) || 1 : 1
  // Server emits livePreferredSources in canonical (canName) form, but
  // delta `$source` may be numeric when the provider has useCanName off.
  // Canonicalise the row's source before comparing so the badge follows
  // the same identity rule the priority engine uses. Fan-out paths
  // intentionally deliver every source — no row is "the preferred",
  // so the badge would just oscillate between rows on each delta.
  // Across-context view ("All") flattens into a single map keyed by
  // `${context}\0${path}` — without the context two vessels with the
  // same path would resolve to whichever winner was iterated last.
  const preferredKey = showContext ? `${realContext}\0${path}` : path
  const isPreferred =
    !!preferredSourceByPath &&
    !!path &&
    !fanOutPaths?.has(path) &&
    preferredSourceByPath.get(preferredKey) ===
      canonicaliseSourceRef(source, sourcesData)

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
        {data.state?.timedOut && data.state.lastValue !== undefined && (
          <div
            className="text-muted"
            style={{ fontSize: '0.85em', marginTop: '2px' }}
            title={`Last good value at ${data.state.lastValue.timestamp}`}
          >
            last:{' '}
            <DefaultValueRenderer
              value={data.state.lastValue.value}
              units={units}
              convertedValue={lastConvertedValue}
              convertedUnit={lastConvertedUnit}
            />
          </div>
        )}
      </div>

      <TimestampCell timestamp={timestamp} isPaused={isPaused} />

      <div className="virtual-table-cell source-cell" data-label="Source">
        {data.state?.timedOut && (
          <Badge
            bg="warning"
            title="Server-side staleness enforcement marked this path+source as timed out"
            style={{ marginRight: '4px', fontSize: '0.7em' }}
          >
            Stale
          </Badge>
        )}
        {isPreferred && (
          <Badge
            bg="success"
            title="Preferred source"
            style={{ marginRight: '4px', fontSize: '0.7em' }}
          >
            Preferred
          </Badge>
        )}
        {fanOutPaths?.has(path) && (
          <Badge
            bg="info"
            title="Fan-out path — every source's value is delivered, no priority filtering"
            style={{ marginRight: '4px', fontSize: '0.7em' }}
          >
            Fan-out
          </Badge>
        )}
        <CopyToClipboardWithFade text={source}>
          <SourceLabel sourceRef={source} sourcesData={sourcesData} />{' '}
          <span className="copy-icon" aria-hidden="true" />
        </CopyToClipboardWithFade>{' '}
        {data.pgn && <span>&nbsp;{data.pgn}</span>}
        {data.sentence && <span>&nbsp;{data.sentence}</span>}
        {(() => {
          // X/Y badge — only meaningful for self-vessel rows where the
          // priority engine actually applies, never for notifications.
          if (realContext !== 'self') return null
          if (path === 'notifications' || path.startsWith('notifications.')) {
            return null
          }
          if (sourceCount <= 1) return null
          // 'Priority filtered' mode: red warning, only on paths the
          // user hasn't configured AND the engine isn't routing
          // (no override, no group claim). Means "you should set a
          // priority for this path".
          if (sourceFilter) {
            if (configuredPriorityPaths.has(path)) return null
            if (routedPaths?.has(path)) return null
            return (
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
            )
          }
          // 'All sources' mode: neutral informational count. Tells the
          // user "this path has N sources and you're seeing all of
          // them." Click still routes to the priorities page so the
          // user can act if they want.
          return (
            <a
              href={`#/data/priorities?path=${encodeURIComponent(path)}`}
              style={{
                marginLeft: '4px',
                fontSize: '0.7em',
                color: 'var(--bs-secondary-color, #6c757d)',
                fontWeight: 500,
                textDecoration: 'none'
              }}
              title={`${sourceCount} sources publish this path`}
            >
              1/{sourceCount}
            </a>
          )
        })()}
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
