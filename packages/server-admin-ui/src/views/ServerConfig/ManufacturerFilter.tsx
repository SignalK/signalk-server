import { ChangeEvent, useEffect, useState } from 'react'
import Button from 'react-bootstrap/Button'
import Form from 'react-bootstrap/Form'
import InputGroup from 'react-bootstrap/InputGroup'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCirclePlus } from '@fortawesome/free-solid-svg-icons/faCirclePlus'
import { faXmark } from '@fortawesome/free-solid-svg-icons/faXmark'

export interface Manufacturer {
  name: string
  code: number
}

interface ManufacturerFilterProps {
  options: {
    filtersEnabled?: boolean
    manufacturerFilter?: string
    manufacturers?: string[]
    [key: string]: unknown
  }
  onChange: (event: { target: { name: string; value: unknown } }) => void
  /** The names to pick from; fetched from the server when not given. */
  known?: Manufacturer[]
}

const EMPTY: string[] = []

/**
 * A connection's manufacturer filter (canboat/canboatjs#588): keep only the
 * devices of the listed manufacturers, or drop theirs. canboatjs applies it
 * before decoding.
 */
export default function ManufacturerFilter({
  options,
  onChange,
  known
}: ManufacturerFilterProps) {
  const [fetched, setFetched] = useState<Manufacturer[] | undefined>(undefined)
  const [entry, setEntry] = useState('')

  useEffect(() => {
    if (known !== undefined) {
      return
    }
    fetch(`${window.serverRoutesPrefix}/n2kManufacturers`, {
      credentials: 'include'
    })
      .then((response) => (response.ok ? response.json() : []))
      .then((list: Manufacturer[]) => setFetched(list))
      .catch(() => setFetched([]))
  }, [known])

  const manufacturers = known ?? fetched ?? []
  const mode = options.manufacturerFilter ?? ''
  const chosen = Array.isArray(options.manufacturers)
    ? options.manufacturers
    : EMPTY
  const disabled = !options.filtersEnabled

  // A name as the list spells it, if it is one; any case is accepted.
  const listed = (name: string) =>
    manufacturers.find(
      (m) => m.name.toLowerCase() === name.trim().toLowerCase()
    )
  const canAdd =
    entry.trim() !== '' &&
    !chosen.includes(listed(entry)?.name ?? entry.trim()) &&
    (manufacturers.length === 0 || listed(entry) !== undefined)

  const setChosen = (value: string[]) =>
    onChange({ target: { name: 'options.manufacturers', value } })

  const add = () => {
    if (!canAdd) {
      return
    }
    setChosen([...chosen, listed(entry)?.name ?? entry.trim()])
    setEntry('')
  }

  return (
    <div className="mt-3">
      <Form.Label htmlFor="manufacturerFilter" className="fw-bold">
        Manufacturers
      </Form.Label>
      <Form.Select
        id="manufacturerFilter"
        aria-describedby="manufacturerFilterHelp"
        value={mode}
        disabled={disabled}
        onChange={(e: ChangeEvent<HTMLSelectElement>) =>
          onChange({
            target: {
              name: 'options.manufacturerFilter',
              value: e.target.value === '' ? undefined : e.target.value
            }
          })
        }
      >
        <option value="">All manufacturers</option>
        <option value="allow">Only devices of these manufacturers</option>
        <option value="deny">All devices except these manufacturers</option>
      </Form.Select>
      <Form.Text id="manufacturerFilterHelp" muted className="d-block mb-2">
        A device&apos;s manufacturer comes from its address claim, or until then
        from its proprietary messages. Nothing from a device is used until its
        manufacturer is known. Network messages, such as address claims, always
        come through. Needs canboatjs 4 or later.
      </Form.Text>
      {mode !== '' && (
        <>
          <div className="mb-2">
            {chosen.map((name) => (
              <Button
                key={name}
                size="sm"
                variant="outline-secondary"
                className="me-2 mb-1"
                aria-label={`Remove ${name}`}
                disabled={disabled}
                onClick={() => setChosen(chosen.filter((n) => n !== name))}
              >
                {name} <FontAwesomeIcon icon={faXmark} />
              </Button>
            ))}
          </div>
          <InputGroup size="sm" style={{ maxWidth: '30em' }}>
            <Form.Control
              type="text"
              list="n2kManufacturerNames"
              aria-label="Manufacturer"
              placeholder="Manufacturer"
              value={entry}
              disabled={disabled}
              onChange={(e) => setEntry(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  add()
                }
              }}
            />
            <Button
              variant="primary"
              disabled={disabled || !canAdd}
              onClick={add}
            >
              <FontAwesomeIcon icon={faCirclePlus} /> Add manufacturer
            </Button>
          </InputGroup>
          <datalist id="n2kManufacturerNames">
            {manufacturers.map((m) => (
              <option key={m.name} value={m.name} />
            ))}
          </datalist>
        </>
      )}
    </div>
  )
}
