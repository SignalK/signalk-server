import { ChangeEvent } from 'react'
import {
  Table,
  Input,
  Button,
  Card,
  CardBody,
  CardHeader,
  Label
} from 'reactstrap'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTrash } from '@fortawesome/free-solid-svg-icons/faTrash'
import { faCirclePlus } from '@fortawesome/free-solid-svg-icons/faCirclePlus'

interface N2KFilter {
  source: string
  pgn: string
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
      | { target: { name: string; value: unknown; type?: string } }
  ) => void
}

export default function N2KFilters({ value, onChange }: N2KFiltersProps) {
  const filters = value.options.filters ?? []

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
        type: 'checkbox'
      }
    })
  }

  const handleAddFilter = () => {
    const updatedFilters = [...filters, { source: '', pgn: '' }]
    onChange({
      target: { name: 'options.filters', value: updatedFilters }
    })
  }

  const sourceName = value.options.useCanName ? 'Can NAME' : 'Address'

  return (
    <div>
      <Card>
        <CardHeader>Filters</CardHeader>
        <CardBody>
          <Label className="switch switch-text switch-primary">
            <Input
              type="checkbox"
              name="filtersEnabled"
              className="switch-input"
              checked={value.options.filtersEnabled}
              onChange={handleEnabledChange}
            />
            <span className="switch-label" data-on="Yes" data-off="No" />
            <span className="switch-handle" />
          </Label>
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
                  // Use composite key - filters don't have stable unique IDs
                  const filterKey = `${index}-${filter.source}-${filter.pgn}`
                  return (
                    <tr key={filterKey}>
                      <td>
                        <Input
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
                        <Input
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
                          color="link"
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
          <Button size="sm" color="primary" onClick={() => handleAddFilter()}>
            <FontAwesomeIcon icon={faCirclePlus} /> Add
          </Button>
        </CardBody>
      </Card>
    </div>
  )
}
