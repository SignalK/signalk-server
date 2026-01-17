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
  const filterChanged = (
    filter: N2KFilter,
    event: ChangeEvent<HTMLInputElement>
  ) => {
    filter[event.target.name as keyof N2KFilter] = event.target.value
    onChange(event)
  }

  const deleteFilter = (index: number, event: React.MouseEvent) => {
    value.options.filters?.splice(index, 1)
    onChange(event as unknown as ChangeEvent<HTMLInputElement>)
  }

  const handleEnabledChange = (event: ChangeEvent<HTMLInputElement>) => {
    value.options.filtersEnabled = event.target.checked
    onChange(event)
  }

  const handleAddFilter = (event: React.MouseEvent) => {
    if (!value.options.filters) {
      value.options.filters = []
    }
    value.options.filters.push({ source: '', pgn: '' })
    onChange(event as unknown as ChangeEvent<HTMLInputElement>)
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
          {value.options.filters && value.options.filters.length > 0 && (
            <Table responsive bordered striped size="sm">
              <thead>
                <tr>
                  <th>{sourceName}</th>
                  <th>PGN</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {value.options.filters.map((filter, index) => {
                  return (
                    <tr key={index}>
                      <td>
                        <Input
                          type="text"
                          name="source"
                          value={filter.source}
                          onChange={(e) => filterChanged(filter, e)}
                        />
                      </td>
                      <td>
                        <Input
                          type="text"
                          name="pgn"
                          value={filter.pgn}
                          onChange={(e) => filterChanged(filter, e)}
                        />
                      </td>
                      <td>
                        <Button
                          color="link"
                          className="text-danger"
                          onClick={(e) => deleteFilter(index, e)}
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
          <Button size="sm" color="primary" onClick={handleAddFilter}>
            <FontAwesomeIcon icon={faCirclePlus} /> Add
          </Button>
        </CardBody>
      </Card>
    </div>
  )
}
