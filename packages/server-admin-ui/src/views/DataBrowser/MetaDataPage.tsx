import React, { useMemo } from 'react'
import Select, {
  components,
  type OptionProps,
  type SingleValue
} from 'react-select'
import Card from 'react-bootstrap/Card'
import Col from 'react-bootstrap/Col'
import Form from 'react-bootstrap/Form'
import Row from 'react-bootstrap/Row'
import VirtualizedMetaTable from './VirtualizedMetaTable'
import type { PathData } from '../../store'
import { useStore } from '../../store'
import { useSignalKData, type SelectOption } from './useSignalKData'

const getSignalkData = () => useStore.getState().signalkData

const ContextOption = (props: OptionProps<SelectOption>) => {
  const { data } = props
  const needsBorder = data.value === 'self' || data.isFirstAis
  return (
    <div style={needsBorder ? { borderTop: '1px solid #ccc' } : undefined}>
      <components.Option {...props} />
    </div>
  )
}

const MetaDataPage: React.FC = () => {
  const {
    context,
    setContext: handleContextChange,
    contextOptions,
    search,
    setSearch: handleSearch,
    dataVersion
  } = useSignalKData()

  const currentContext: SelectOption | null =
    contextOptions.find((option) => option.value === context) || null

  const onContextChange = (selectedOption: SingleValue<SelectOption>) => {
    const value = selectedOption ? selectedOption.value : 'none'
    handleContextChange(value)
  }

  const uniquePathsForMeta = useMemo(() => {
    const currentData = dataVersion >= 0 ? getSignalkData() : {}
    const contexts = context === 'all' ? Object.keys(currentData) : [context]
    const paths: string[] = []
    const seen = new Set<string>()

    for (const ctx of contexts) {
      const contextData = currentData[ctx] || {}
      for (const key of Object.keys(contextData)) {
        if (search && search.length > 0) {
          const lowerKey = key.toLowerCase()
          const terms = search
            .toLowerCase()
            .split(/\s+/)
            .filter((t) => t.length > 0)
          if (
            terms.length > 0 &&
            !terms.some((term) => lowerKey.includes(term))
          ) {
            continue
          }
        }
        const data = contextData[key] as PathData | undefined
        const path = data?.path || key
        const dedupKey = context === 'all' ? `${ctx}\0${path}` : path
        if (!seen.has(dedupKey)) {
          seen.add(dedupKey)
          paths.push(dedupKey)
        }
      }
    }

    return paths.sort()
  }, [context, search, dataVersion])

  return (
    <div className="animated fadeIn">
      <Card>
        <Card.Body>
          <Form
            className="form-horizontal"
            onSubmit={(e) => {
              e.preventDefault()
            }}
          >
            <Form.Group as={Row}>
              <Col xs="12" md="4">
                <Select<SelectOption, false>
                  value={currentContext}
                  onChange={onContextChange}
                  options={contextOptions}
                  placeholder="Select a context"
                  isSearchable={true}
                  isClearable={true}
                  maxMenuHeight={500}
                  noOptionsMessage={() => 'No contexts available'}
                  components={{ Option: ContextOption }}
                  styles={{
                    control: (base, state) => ({
                      ...base,
                      backgroundColor: 'var(--sk-input-bg)',
                      borderColor: state.isFocused
                        ? 'var(--bs-primary)'
                        : 'var(--sk-input-border-color)',
                      boxShadow: state.isFocused
                        ? '0 0 0 0.25rem var(--bs-primary-rgb, rgba(13,110,253,0.25))'
                        : 'none',
                      '&:hover': {
                        borderColor: 'var(--bs-primary)'
                      }
                    }),
                    singleValue: (base) => ({
                      ...base,
                      color: 'var(--bs-body-color)'
                    }),
                    input: (base) => ({
                      ...base,
                      color: 'var(--bs-body-color)'
                    }),
                    placeholder: (base) => ({
                      ...base,
                      color: 'var(--bs-secondary-color)'
                    }),
                    menu: (base) => ({
                      ...base,
                      zIndex: 100,
                      backgroundColor: 'var(--bs-body-bg)',
                      border: '1px solid var(--sk-dropdown-border-color)'
                    }),
                    menuList: (base) => ({
                      ...base,
                      backgroundColor: 'var(--bs-body-bg)'
                    }),
                    option: (base, state) => ({
                      ...base,
                      backgroundColor: state.isSelected
                        ? 'var(--bs-primary)'
                        : state.isFocused
                          ? 'var(--bs-tertiary-bg)'
                          : 'transparent',
                      color: state.isSelected ? '#fff' : 'var(--bs-body-color)',
                      ':hover': {
                        backgroundColor: state.isSelected
                          ? 'var(--bs-primary)'
                          : 'var(--bs-tertiary-bg)'
                      }
                    })
                  }}
                />
              </Col>
            </Form.Group>
            {context && context !== 'none' && (
              <Form.Group as={Row}>
                <Col xs="3" md="2">
                  <label htmlFor="metadata-search">Search</label>
                </Col>
                <Col xs="9" md="10">
                  <Form.Control
                    type="text"
                    id="metadata-search"
                    name="search"
                    autoComplete="off"
                    placeholder="e.g. pos wind (space = OR)"
                    onChange={handleSearch}
                    value={search}
                  />
                </Col>
              </Form.Group>
            )}

            {context && context !== 'none' && (
              <VirtualizedMetaTable
                paths={uniquePathsForMeta}
                context={context}
                showContext={context === 'all'}
              />
            )}
          </Form>
        </Card.Body>
      </Card>
    </div>
  )
}

export default MetaDataPage
