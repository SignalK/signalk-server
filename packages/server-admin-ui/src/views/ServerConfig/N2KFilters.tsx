import { ChangeEvent, useMemo } from 'react'
import Button from 'react-bootstrap/Button'
import Card from 'react-bootstrap/Card'
import Form from 'react-bootstrap/Form'
import Table from 'react-bootstrap/Table'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTrash } from '@fortawesome/free-solid-svg-icons/faTrash'
import { faCirclePlus } from '@fortawesome/free-solid-svg-icons/faCirclePlus'

interface N2KFilter {
  source: string
  pgn: string
  /**
   * Client-only stable id for React keys. Not persisted to the server —
   * stripped by stripFilterKeys() in ProvidersConfiguration before save.
   * Without this, deleting a row with index-based keys would shuffle
   * subsequent rows' input state.
   */
  _key?: string
}

let filterKeyCounter = 0
const newKey = () => `n2kf-${++filterKeyCounter}`

// Filters loaded from the server arrive without _key. Assign keys lazily
// and cache by object identity so the same filter object keeps its key
// across re-renders and re-derivations of the filters array.
const keyByFilter = new WeakMap<N2KFilter, string>()
// Stable reference for the no-filters case so useMemo below isn't
// invalidated on every render when value.options.filters is undefined.
const EMPTY_FILTERS: N2KFilter[] = []
const ensureKey = (filter: N2KFilter): N2KFilter => {
  if (filter._key) return filter
  let key = keyByFilter.get(filter)
  if (!key) {
    key = newKey()
    keyByFilter.set(filter, key)
  }
  return { ...filter, _key: key }
}

interface ProviderOptions {
  filtersEnabled?: boolean
  filters?: N2KFilter[]
  useCanName?: boolean
  [key: string]: unknown
}

interface ProviderValue {
  options: ProviderOptions
  [key: string]: unknown
}

interface N2KFiltersProps {
  value: ProviderValue
  onChange: (
    event:
      | ChangeEvent<HTMLInputElement>
      | {
          target: {
            name: string
            value: unknown
            type?: string
            checked?: boolean
          }
        }
  ) => void
}

export default function N2KFilters({ value, onChange }: N2KFiltersProps) {
  const rawFilters = value.options.filters ?? EMPTY_FILTERS
  const filters = useMemo(() => rawFilters.map(ensureKey), [rawFilters])

  const handleFilterFieldChange = (
    index: number,
    field: keyof N2KFilter,
    newValue: string
  ) => {
    const updatedFilters = filters.map((filter, i) =>
      i === index ? { ...filter, [field]: newValue } : filter
    )
    onChange({
      target: { name: 'options.filters', value: updatedFilters }
    })
  }

  const deleteFilter = (index: number) => {
    const updatedFilters = filters.filter((_, i) => i !== index)
    onChange({
      target: { name: 'options.filters', value: updatedFilters }
    })
  }

  const handleEnabledChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange({
      target: {
        name: 'options.filtersEnabled',
        value: event.target.checked,
        checked: event.target.checked,
        type: 'checkbox'
      }
    })
  }

  const handleAddFilter = () => {
    const updatedFilters = [...filters, { source: '', pgn: '', _key: newKey() }]
    onChange({
      target: { name: 'options.filters', value: updatedFilters }
    })
  }

  const sourceName = value.options.useCanName ? 'Can NAME' : 'Address'

  return (
    <div>
      <Card>
        <Card.Header>Filters</Card.Header>
        <Card.Body>
          <Form.Label className="switch switch-text switch-primary">
            <input
              type="checkbox"
              name="filtersEnabled"
              className="switch-input"
              checked={!!value.options.filtersEnabled}
              onChange={handleEnabledChange}
            />
            <span className="switch-label" data-on="Yes" data-off="No" />
            <span className="switch-handle" />
          </Form.Label>
          &nbsp; Enabled <br />
          <br />
          Filter out all messages from a specific {sourceName} by entering just
          the {sourceName}.<br />
          Filter out a specific PGN from all devices by entering just the PGN.
          <br />
          Filter out a specific PGN from a specific {sourceName} by entering
          both.
          <br />
          <br />
          {filters.length > 0 && (
            <Table responsive bordered striped size="sm">
              <thead>
                <tr>
                  <th>{sourceName}</th>
                  <th>PGN</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filters.map((filter, index) => {
                  return (
                    <tr key={filter._key ?? index}>
                      <td>
                        <Form.Control
                          type="text"
                          name="source"
                          value={filter.source}
                          onChange={(e) =>
                            handleFilterFieldChange(
                              index,
                              'source',
                              e.target.value
                            )
                          }
                        />
                      </td>
                      <td>
                        <Form.Control
                          type="text"
                          name="pgn"
                          value={filter.pgn}
                          onChange={(e) =>
                            handleFilterFieldChange(
                              index,
                              'pgn',
                              e.target.value
                            )
                          }
                        />
                      </td>
                      <td>
                        <Button
                          variant="link"
                          className="text-danger"
                          onClick={() => deleteFilter(index)}
                        >
                          <FontAwesomeIcon icon={faTrash} />
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          )}
          <Button size="sm" variant="primary" onClick={() => handleAddFilter()}>
            <FontAwesomeIcon icon={faCirclePlus} /> Add
          </Button>
        </Card.Body>
      </Card>
    </div>
  )
}
