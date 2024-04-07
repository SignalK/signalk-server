import React, { Component } from 'react'

import { Button, Table } from 'reactstrap'
import NameCellRenderer from './Grid/cell-renderers/NameCellRenderer'
import TypeCellRenderer from './Grid/cell-renderers/TypeCellRenderer'
import ActionCellRenderer from './Grid/cell-renderers/ActionCellRenderer'

const XL_WIDTH = 1200
const L_WIDTH = 992
const M_WIDTH = 768

class AppsList extends Component {
  render() {
    return (
      <Table>
        <thead>
          <tr>
            <th>Name</th>
            <th className={window.innerWidth < L_WIDTH ? 'd-none' : ''}>
              Description
            </th>
            <th className={window.innerWidth < XL_WIDTH ? 'd-none' : ''}>
              Author
            </th>
            <th
              className={
                'text-center ' + (window.innerWidth < M_WIDTH ? 'd-none' : '')
              }
            >
              <div>Type</div>
            </th>
            <th class="text-center">Action</th>
          </tr>
        </thead>
        <tbody>
          {this.props.apps.map((app) => (
            <tr key={app.name}>
              <td>
                <NameCellRenderer
                  data={app}
                  value={app.name}
                ></NameCellRenderer>
              </td>
              <td className={window.innerWidth < L_WIDTH ? 'd-none' : ''}>
                {app.description}
              </td>
              <td className={window.innerWidth < XL_WIDTH ? 'd-none' : ''}>
                {app.author}
              </td>
              <td
                col-id="type"
                className={window.innerWidth < M_WIDTH ? 'd-none' : ''}
              >
                <TypeCellRenderer data={app}></TypeCellRenderer>
              </td>
              <td col-id="action">
                <ActionCellRenderer data={app}></ActionCellRenderer>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    )
  }
}

export default AppsList
