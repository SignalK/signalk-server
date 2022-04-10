import React from 'react'
import { Table, TabPane } from 'reactstrap'

export function n2kPanel(n2kData, tabId, cursorOnRow, scrollIntoViewHandlers) {
  return (
    <TabPane tabId={tabId}>
      <div style={{ overflowY: 'scroll', maxHeight: '60vh' }}>
        <Table responsive bordered striped size="sm">
          <thead>
            <tr>
              <th>Header</th>
              <th>Fields</th>
            </tr>
          </thead>
          <tbody>
            {n2kData.map((pgnData) => {
              const rowRef = React.createRef(null)
              scrollIntoViewHandlers[pgnData.msgIndex] = () =>
                rowRef.current.scrollIntoView({ behavior: 'smooth' })

              const rowIsFromCursorRow =
                pgnData.msgRange[0] <= cursorOnRow &&
                cursorOnRow <= pgnData.msgRange[1]
              const style = rowIsFromCursorRow
                ? { backgroundColor: 'LightYellow' }
                : {}
              return (
                <tr
                  key={`${pgnData.timestamp}${pgnData.pgn}`}
                  ref={rowRef}
                  style={style}
                >
                  <td>
                    {pgnData.pgn} (src:{pgnData.src})
                    <br />
                    {pgnData.timestamp.split('T')[1]}
                    <br />
                    {pgnData.description}
                  </td>
                  <td>
                    <pre
                      className="text-primary"
                      style={{ whiteSpace: 'pre-wrap' }}
                    >
                      {Object.keys(pgnData.fields).map(
                        (fieldName) =>
                          `${fieldName}:${preformat(
                            pgnData.fields[fieldName]
                          )}\n`
                      )}
                    </pre>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </Table>
      </div>
    </TabPane>
  )
}

const preformat = (d) => (typeof d === 'object' ? JSON.stringify(d) : d)
