import React from 'react'
import Badge from 'react-bootstrap/Badge'

interface WasmBadgeProps {
  isWasm?: boolean
  className?: string
}

// WASM plugins need the WebAssembly runtime enabled in Server Settings;
// the badge lets users tell them apart before installing.
const WasmBadge: React.FC<WasmBadgeProps> = ({ isWasm, className }) => {
  if (!isWasm) return null
  return (
    <Badge bg="secondary" className={className} title="WebAssembly plugin">
      WASM
    </Badge>
  )
}

export default WasmBadge
