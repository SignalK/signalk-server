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
          if (key.toLowerCase().indexOf(search.toLowerCase()) === -1) {
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
            action=""
            method="post"
            encType="multipart/form-data"
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
                    menu: (base) => ({ ...base, zIndex: 100 }),
                    option: (base, state) => ({
                      ...base,
                      backgroundColor: state.isSelected
                        ? base.backgroundColor
                        : 'transparent',
                      ':hover': {
                        backgroundColor: '#deebff'
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
                <Col xs="12" md="12">
                  <Form.Control
                    type="text"
                    id="metadata-search"
                    name="search"
                    autoComplete="off"
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
