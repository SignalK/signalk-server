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
  filtersBeforeDecoding?: boolean
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
  /**
   * The connection decodes with canboatjs, which can drop the PGN-only rows
   * before decoding.
   */
  canDropBeforeDecoding?: boolean
  /** canboatjs drops them in the kernel (SocketCAN, canbus-canboatjs). */
  dropsInKernel?: boolean
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

export default function N2KFilters({
  value,
  onChange,
  canDropBeforeDecoding,
  dropsInKernel
}: N2KFiltersProps) {
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

  const handleSwitchChange =
    (name: string) => (event: ChangeEvent<HTMLInputElement>) => {
      onChange({
        target: {
          name,
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
              aria-label="Filters enabled"
              className="switch-input"
              checked={!!value.options.filtersEnabled}
              onChange={handleSwitchChange('options.filtersEnabled')}
            />
            <span className="switch-label" data-on="Yes" data-off="No" />
            <span className="switch-handle" />
          </Form.Label>
          &nbsp; Enabled <br />
          <br />
          Usage:
          <ul className="mb-2">
            <li>
              Filter out all messages from a specific {sourceName} by entering
              just the {sourceName}.
            </li>
            <li>
              Filter out a specific PGN from all devices by entering just the
              PGN.
            </li>
            <li>
              Filter out a specific PGN from a specific {sourceName} by entering
              both.
            </li>
          </ul>
          What it does:
          <br />
          Filtered messages are removed from the Signal K data. For example to
          keep unwanted data out.
          {canDropBeforeDecoding &&
            ' To also save CPU, drop them before decoding (below).'}
          <br />
          <br />
          {canDropBeforeDecoding && (
            <>
              <Form.Label className="switch switch-text switch-primary">
                <input
                  type="checkbox"
                  name="filtersBeforeDecoding"
                  aria-label="Drop filtered PGNs before decoding"
                  aria-describedby="filtersBeforeDecodingHelp"
                  className="switch-input"
                  checked={!!value.options.filtersBeforeDecoding}
                  disabled={!value.options.filtersEnabled}
                  onChange={handleSwitchChange('options.filtersBeforeDecoding')}
                />
                <span className="switch-label" data-on="Yes" data-off="No" />
                <span className="switch-handle" />
              </Form.Label>
              &nbsp; Drop filtered PGNs before decoding
              <Form.Text
                id="filtersBeforeDecodingHelp"
                muted
                className="d-block"
              >
                Recommended. Filters without an {sourceName} are then applied
                before Signal K decodes the message
                {dropsInKernel
                  ? ', at Linux kernel level, so Signal K never reads those messages'
                  : ''}
                . That saves CPU on a busy network. Leave it off only if a
                plugin or an output needs the filtered PGNs, such as NMEA 2000
                over TCP or a logger of raw NMEA 2000 data. Filters with an{' '}
                {sourceName} are always applied after Signal K has decoded the
                message. Needs canboatjs 4 or later.
              </Form.Text>
              <br />
            </>
          )}
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
