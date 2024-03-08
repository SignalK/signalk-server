/* Cell rendering */
import TypeCellRenderer from './cell-renderers/TypeCellRenderer'
import NameCellRenderer from './cell-renderers/NameCellRenderer'
import ActionCellRenderer from './cell-renderers/ActionCellRenderer'

export default [
  {
    field: 'name',
    headerName: 'Name',
    cellRenderer: NameCellRenderer,
    sortable: true,
    autoHeight: true,
  },
  {
    colId: 'description',
    field: 'description',
    headerName: 'Description',
    cellClass: 'cell-description',
    wrapText: true,
    sortable: false,
    autoHeight: true,
  },
  { colId: 'author', field: 'author', headerName: 'Author', wrapText: true },
  {
    colId: 'type',
    field: 'type',
    headerName: 'Type',
    cellRenderer: TypeCellRenderer,
    maxWidth: 100,
    sortable: false,
    cellStyle: { 'justify-content': 'center' },
  },
  {
    field: 'action',
    headerName: 'Action',
    cellRenderer: ActionCellRenderer,
    width: 60,
    sortable: false,
  },
]
