/* Cell rendering */
import TypeCellRenderer from './cell-renderers/TypeCellRenderer'
import NameCellRenderer from './cell-renderers/NameCellRenderer'
import ActionCellRenderer from './cell-renderers/ActionCellRenderer'

export default [
  {
    field: 'name',
    header: 'Name',
    cellRenderer: NameCellRenderer,
    sort: true,
  },
  {
    colId: 'description',
    field: 'description',
    header: 'Description',
    cellClass: 'cell-description',
    wrapText: true,
    sort: false,
  },
  { colId: 'author', field: 'author', header: 'Author', wrapText: true },
  {
    colId: 'type',
    field: 'type',
    header: 'Type',
    cellRenderer: TypeCellRenderer,
    width: 60,
    sort: false,
  },
  {
    field: 'action',
    header: 'Action',
    cellRenderer: ActionCellRenderer,
    width: 60,
    sort: false,
  },
]
