import React, { Component } from 'react'
import { connect } from 'react-redux'
import { Table, Input, Button, Card, CardBody, CardHeader, FormText } from 'reactstrap'

class N2KFilters extends Component {
  constructor(props) {
    super()

    this.handleAddFilter = this.handleAddFilter.bind(this)
  }

  filterChanged (filter, event) {
    filter[event.target.name] = event.target.value
    this.props.onChange(event)
  }

  deleteFilter(index, event) {
    this.props.value.options.filters.splice(index, 1)
    this.props.onChange(event)
  }

  handleAddFilter(event) {
    if ( !this.props.value.options.filters ) {
      this.props.value.options.filters = []
    }
    this.props.value.options.filters.push({ source:'', pgn: '' })
    this.props.onChange(event)
  }

  render () {
    const sourceName = this.props.value.options.useCanName ? 'Can NAME' : 'Address'
    return (
        <div>
        <Card>
        <CardHeader>Filters</CardHeader>
        <CardBody>
        Filter out all messages from a specific {sourceName} by entering just the {sourceName}.<br/>
        Filter out a specific PGN from all devices by entering just the PGN.<br/>
        Filter out a specific PGN from a specific {sourceName} by entering both.<br/><br/>
      
        {this.props.value.options.filters && this.props.value.options.filters.length > 0 && (
            <Table responsive bordered striped size='sm'>
              <thead>
                <tr>
                  <th>{sourceName}</th>
                  <th>PGN</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {this.props.value.options.filters.map((filter, index) => {
                  return (
                    <tr
                      key={index}
                    >
                      <td>
                      <Input
                    type='text'
                    name='source'
                    value={filter.source}
                    onChange={this.filterChanged.bind(this, filter)}
                      />
                      </td>
                      <td>
                      <Input
                    type='text'
                    name='pgn'
                    value={filter.pgn}
                    onChange={this.filterChanged.bind(this, filter)}
                      />
                      </td>
                      <td>
                      <Button
              color='link'
              className='text-danger'
              onClick={this.deleteFilter.bind(this, index)}
                      >
                      <i className='fas fa-trash' />
            </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
            )}
          <Button size='sm' color='primary' onClick={this.handleAddFilter}>
            <i className='fa fa-plus-circle' /> Add
          </Button>
        </CardBody>
        </Card>
        </div>
    )
  }
}

export default N2KFilters
