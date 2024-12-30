import React, { Component } from 'react'

import { Table } from 'reactstrap'
import NameCellRenderer from './Grid/cell-renderers/NameCellRenderer'
import TypeCellRenderer from './Grid/cell-renderers/TypeCellRenderer'
import ActionCellRenderer from './Grid/cell-renderers/ActionCellRenderer'
import VersionCellRenderer from './Grid/cell-renderers/VersionCellRenderer'

const XL_WIDTH = 1200
const L_WIDTH = 992
const M_WIDTH = 768
const S_WIDTH = 576

class AppsList extends Component {
  render() {
    return (
      <Table>
        <thead>
          <tr>
            <th>Name</th>
            <th
              className={
                'text-center ' + (window.innerWidth < S_WIDTH ? 'd-none' : '')
              }
            >
              Version
            </th>
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

            <th className="text-center">Action</th>
          </tr>
        </thead>
        <tbody>
          {this.props.apps.map((app) => (
            <tr key={app.name}>
              <td>
                <NameCellRenderer data={app} value={app.name} />
              </td>
              <td className={window.innerWidth < S_WIDTH ? 'd-none' : ''}>
                <VersionCellRenderer data={app} />
              </td>
              <td className={window.innerWidth < L_WIDTH ? 'd-none' : ''}>
                {app.description}
              </td>
              <td className={window.innerWidth < XL_WIDTH ? 'd-none' : ''}>
                {app.author}
              </td>
              <td className={window.innerWidth < M_WIDTH ? 'd-none' : ''}>
                <TypeCellRenderer data={app} />
              </td>

              <td>
                <ActionCellRenderer data={app} />
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    )
  }
}

export default AppsList
