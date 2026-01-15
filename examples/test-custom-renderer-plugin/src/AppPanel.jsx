import React, { useState, useEffect } from 'react'

/**
 * An embedded webapp panel that displays test information
 * and demonstrates React 19 compatibility.
 */
const AppPanel = ({ adminUI, loginStatus }) => {
  const [count, setCount] = useState(0)
  const [wsData, setWsData] = useState(null)

  useEffect(() => {
    // Test WebSocket connection via adminUI
    if (adminUI && adminUI.openWebsocket) {
      const ws = adminUI.openWebsocket({ subscribe: 'self' })
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.updates) {
            setWsData(data)
          }
        } catch (e) {
          // ignore parse errors
        }
      }
      return () => ws.close()
    }
  }, [adminUI])

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h2>🧪 Test Custom Renderer Plugin</h2>
      <p>This embedded webapp tests React 19 compatibility.</p>

      <div style={{
        background: '#e8f5e9',
        padding: '15px',
        borderRadius: '8px',
        marginBottom: '15px'
      }}>
        <h3 style={{ margin: '0 0 10px 0' }}>✅ React Version Check</h3>
        <p style={{ margin: 0 }}>
          Running on React: <strong>{React.version}</strong>
        </p>
      </div>

      <div style={{
        background: '#e3f2fd',
        padding: '15px',
        borderRadius: '8px',
        marginBottom: '15px'
      }}>
        <h3 style={{ margin: '0 0 10px 0' }}>🔢 State Test (useState hook)</h3>
        <p>Counter: <strong>{count}</strong></p>
        <button
          onClick={() => setCount(c => c + 1)}
          style={{
            padding: '8px 16px',
            fontSize: '14px',
            cursor: 'pointer',
            borderRadius: '4px',
            border: '1px solid #1976d2',
            background: '#1976d2',
            color: 'white'
          }}
        >
          Increment
        </button>
      </div>

      <div style={{
        background: '#fff3e0',
        padding: '15px',
        borderRadius: '8px',
        marginBottom: '15px'
      }}>
        <h3 style={{ margin: '0 0 10px 0' }}>🔌 WebSocket Test</h3>
        {wsData ? (
          <pre style={{
            margin: 0,
            fontSize: '12px',
            maxHeight: '150px',
            overflow: 'auto',
            background: '#fff',
            padding: '10px',
            borderRadius: '4px'
          }}>
            {JSON.stringify(wsData, null, 2)}
          </pre>
        ) : (
          <p style={{ margin: 0 }}>Waiting for WebSocket data...</p>
        )}
      </div>

      <div style={{
        background: '#f3e5f5',
        padding: '15px',
        borderRadius: '8px'
      }}>
        <h3 style={{ margin: '0 0 10px 0' }}>👤 Login Status</h3>
        <pre style={{ margin: 0, fontSize: '12px' }}>
          {JSON.stringify(loginStatus, null, 2)}
        </pre>
      </div>
    </div>
  )
}

export default AppPanel
