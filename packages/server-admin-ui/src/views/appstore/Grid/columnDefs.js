/* Cell rendering */
import TypeCellRenderer from './cell-renderers/TypeCellRenderer'
import NameCellRenderer from './cell-renderers/NameCellRenderer'
import ActionCellRenderer from './cell-renderers/ActionCellRenderer'

export default [
  {
    field: 'name',
    headerName: 'Name',
    cellRenderer: NameCellRenderer,
    sortable: false,
    wrapText: true,
    autoHeight: true,
  },
  {
    colId: 'description',
    field: 'description',
    headerName: 'Description',
    cellClass: 'cell-description',
    wrapText: true,
    sortable: false,
    minWidth: 350,
    autoHeight: true,
  },
  {
    colId: 'author',
    field: 'author',
    headerName: 'Author',
    wrapText: true,
    minWidth: 120,
    maxWidth: 140,
    sortable: false,
  },
  {
    colId: 'type',
    field: 'type',
    headerName: 'Type',
    cellRenderer: TypeCellRenderer,
    maxWidth: 100,
    sortable: false,
  },
  {
    field: 'action',
    headerName: 'Action',
    cellRenderer: ActionCellRenderer,
    maxWidth: 100,
    sortable: false,
  },
]
