// Test script to verify EventEmitter maxListeners configuration
const WebSocket = require('ws')

const PORT = process.env.PORT || 3000
const NUM_CONNECTIONS = parseInt(process.argv[2] || '51', 10)
const WS_URL = `ws://localhost:${PORT}/signalk/v1/stream?subscribe=all`

console.log(
  `Testing with ${NUM_CONNECTIONS} WebSocket connections to ${WS_URL}`
)

const connections = []
let connectedCount = 0
let errorCount = 0

for (let i = 0; i < NUM_CONNECTIONS; i++) {
  const ws = new WebSocket(WS_URL)

  ws.on('open', () => {
    connectedCount++
    if (connectedCount === NUM_CONNECTIONS) {
      console.log(
        `✅ All ${NUM_CONNECTIONS} connections established successfully!`
      )
      console.log('Waiting 2 seconds to check for warnings in server logs...')
      setTimeout(() => {
        console.log(
          'Test complete. Check server logs for MaxListenersExceededWarning.'
        )
        connections.forEach((c) => c.close())
        process.exit(0)
      }, 2000)
    }
  })

  ws.on('error', (err) => {
    errorCount++
    console.error(`Connection ${i} error:`, err.message)
  })

  connections.push(ws)
}

// Timeout after 30 seconds
setTimeout(() => {
  console.log(
    `❌ Timeout! Only ${connectedCount}/${NUM_CONNECTIONS} connected, ${errorCount} errors`
  )
  connections.forEach((c) => c.close())
  process.exit(1)
}, 30000)
