import React, { useEffect, useState } from 'react'
import { usePathData, useMetaData } from './usePathData'
import TimestampCell from './TimestampCell'
import CopyToClipboardWithFade from './CopyToClipboardWithFade'
import { getValueRenderer, DefaultValueRenderer } from './ValueRenderers'

// Cache for default categories to avoid repeated fetches
let defaultCategoriesCache = null
let defaultCategoriesFetchPromise = null

/**
 * Fetch default categories from server (cached)
 */
async function fetchDefaultCategories() {
  if (defaultCategoriesCache) {
    return defaultCategoriesCache
  }

  if (defaultCategoriesFetchPromise) {
    return defaultCategoriesFetchPromise
  }

  defaultCategoriesFetchPromise = fetch(
    '/signalk/v1/unitpreferences/default-categories',
    {
      credentials: 'include'
    }
  )
    .then((res) => (res.ok ? res.json() : { categories: {} }))
    .then((data) => {
      defaultCategoriesCache = data.categories || {}
      defaultCategoriesFetchPromise = null
      return defaultCategoriesCache
    })
    .catch((err) => {
      console.error('Failed to fetch default categories:', err)
      defaultCategoriesFetchPromise = null
      return {}
    })

  return defaultCategoriesFetchPromise
}

/**
 * Find category for a path by checking wildcard patterns
 */
function findCategoryForPath(path, defaultCategories) {
  if (!path || !defaultCategories) return null

  for (const [category, config] of Object.entries(defaultCategories)) {
    if (config.paths && Array.isArray(config.paths)) {
      for (const pattern of config.paths) {
        // Handle wildcard patterns like "propulsion.*.temperature"
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
  selectedSources,
  convertValue,
  unitDefinitions,
  presetDetails
}) {
  const data = usePathData(context, path$SourceKey)
  const meta = useMetaData(context, data?.path)
  const [defaultCategories, setDefaultCategories] = useState(null)

  // Load default categories on mount
  useEffect(() => {
    fetchDefaultCategories().then(setDefaultCategories)
  }, [])

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
  // Get category from metadata, or fall back to default categories
  let category = meta?.displayUnits?.category
  if (!category && data?.path && defaultCategories) {
    category = findCategoryForPath(data.path, defaultCategories)
  }

  // Calculate converted value if conversion is available
  let convertedValue = null
  let convertedUnit = null
  if (
    convertValue &&
    category &&
    typeof data.value === 'number' &&
    unitDefinitions &&
    presetDetails
  ) {
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
        <ValueRenderer
          data={data}
          meta={meta}
          units={units}
          raw={raw}
          convertedValue={convertedValue}
          convertedUnit={convertedUnit}
        />
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
function ValueRenderer({
  data,
  meta,
  units,
  raw,
  convertedValue,
  convertedUnit
}) {
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
        convertedValue={convertedValue}
        convertedUnit={convertedUnit}
        {...(meta?.renderer?.options || {})}
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

export default React.memo(DataRow)
