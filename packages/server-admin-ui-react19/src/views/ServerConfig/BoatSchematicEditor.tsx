import React, { useRef, useState, useCallback } from 'react'
import type { GpsSensorConfig } from '../../store/types'

interface BoatSchematicEditorProps {
  sensors: GpsSensorConfig[]
  vesselLength: number
  vesselBeam: number
  colors: string[]
  onUpdateSensor: (index: number, updates: Partial<GpsSensorConfig>) => void
}

const SVG_WIDTH = 200
const SVG_HEIGHT = 340
const PADDING = 30
const DOT_RADIUS = 8

// Boat hull outline — bow at top, stern at bottom
// The hull fits within the padded area
const HULL_LEFT = PADDING
const HULL_RIGHT = SVG_WIDTH - PADDING
const HULL_TOP = PADDING
const HULL_BOTTOM = SVG_HEIGHT - PADDING
const HULL_CX = SVG_WIDTH / 2
const HULL_W = HULL_RIGHT - HULL_LEFT
const HULL_H = HULL_BOTTOM - HULL_TOP

function buildHullPath(): string {
  const bowTip = `${HULL_CX},${HULL_TOP}`
  const bowRight = `${HULL_RIGHT},${HULL_TOP + HULL_H * 0.25}`
  const midRight = `${HULL_RIGHT},${HULL_TOP + HULL_H * 0.5}`
  const sternRight = `${HULL_RIGHT},${HULL_BOTTOM - 10}`
  const sternBottom = `${HULL_CX},${HULL_BOTTOM}`
  const sternLeft = `${HULL_LEFT},${HULL_BOTTOM - 10}`
  const midLeft = `${HULL_LEFT},${HULL_TOP + HULL_H * 0.5}`
  const bowLeft = `${HULL_LEFT},${HULL_TOP + HULL_H * 0.25}`

  return [
    `M ${bowTip}`,
    `C ${HULL_CX + HULL_W * 0.3},${HULL_TOP} ${HULL_RIGHT},${HULL_TOP + HULL_H * 0.12} ${bowRight}`,
    `L ${midRight}`,
    `L ${sternRight}`,
    `Q ${HULL_RIGHT},${HULL_BOTTOM} ${sternBottom}`,
    `Q ${HULL_LEFT},${HULL_BOTTOM} ${sternLeft}`,
    `L ${midLeft}`,
    `L ${bowLeft}`,
    `C ${HULL_LEFT},${HULL_TOP + HULL_H * 0.12} ${HULL_CX - HULL_W * 0.3},${HULL_TOP} ${bowTip}`,
    'Z'
  ].join(' ')
}

const HULL_PATH = buildHullPath()

const BoatSchematicEditor: React.FC<BoatSchematicEditorProps> = ({
  sensors,
  vesselLength,
  vesselBeam,
  colors,
  onUpdateSensor
}) => {
  const svgRef = useRef<SVGSVGElement>(null)
  const [dragging, setDragging] = useState<number | null>(null)

  // Convert fromBow/fromCenter to SVG coordinates
  // SK spec: positive fromCenter = port, negative = starboard
  // SVG: port is left (smaller x), starboard is right (larger x)
  const toSvgCoords = useCallback(
    (fromBow: number | null, fromCenter: number | null) => {
      const bow = fromBow ?? 0
      const center = fromCenter ?? 0
      const y = HULL_TOP + (bow / vesselLength) * HULL_H
      const x = HULL_CX - (center / (vesselBeam / 2)) * (HULL_W / 2)
      return {
        x: Math.max(HULL_LEFT, Math.min(HULL_RIGHT, x)),
        y: Math.max(HULL_TOP, Math.min(HULL_BOTTOM, y))
      }
    },
    [vesselLength, vesselBeam]
  )

  // Convert SVG coordinates back to fromBow/fromCenter
  // SVG x increases rightward (starboard), but SK fromCenter is positive to port
  const toBoatCoords = useCallback(
    (svgX: number, svgY: number) => {
      const clampedY = Math.max(HULL_TOP, Math.min(HULL_BOTTOM, svgY))
      const clampedX = Math.max(HULL_LEFT, Math.min(HULL_RIGHT, svgX))
      const fromBow =
        Math.round(((clampedY - HULL_TOP) / HULL_H) * vesselLength * 10) / 10
      const fromCenter =
        Math.round(
          -((clampedX - HULL_CX) / (HULL_W / 2)) * (vesselBeam / 2) * 10
        ) / 10
      return { fromBow, fromCenter }
    },
    [vesselLength, vesselBeam]
  )

  const getSvgPoint = useCallback((e: React.PointerEvent) => {
    const svg = svgRef.current
    if (!svg) return null
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const ctm = svg.getScreenCTM()
    if (!ctm) return null
    return pt.matrixTransform(ctm.inverse())
  }, [])

  const handlePointerDown = useCallback(
    (index: number) => (e: React.PointerEvent) => {
      e.preventDefault()
      ;(e.target as SVGElement).setPointerCapture(e.pointerId)
      setDragging(index)
    },
    []
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (dragging === null) return
      const svgPt = getSvgPoint(e)
      if (!svgPt) return
      const { fromBow, fromCenter } = toBoatCoords(svgPt.x, svgPt.y)
      onUpdateSensor(dragging, { fromBow, fromCenter })
    },
    [dragging, getSvgPoint, toBoatCoords, onUpdateSensor]
  )

  const handlePointerUp = useCallback(() => {
    setDragging(null)
  }, [])

  return (
    <div className="mt-3 d-flex justify-content-center">
      <svg
        ref={svgRef}
        width={SVG_WIDTH}
        height={SVG_HEIGHT}
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        style={{
          border: '1px solid #dee2e6',
          borderRadius: 4,
          cursor: dragging !== null ? 'grabbing' : 'default'
        }}
      >
        {/* Hull outline */}
        <path d={HULL_PATH} fill="#f8f9fa" stroke="#6c757d" strokeWidth={1.5} />

        {/* Centerline (bow-stern) */}
        <line
          x1={HULL_CX}
          y1={HULL_TOP}
          x2={HULL_CX}
          y2={HULL_BOTTOM}
          stroke="#adb5bd"
          strokeWidth={1}
          strokeDasharray="4 3"
        />

        {/* Midship line (port-starboard) */}
        <line
          x1={HULL_LEFT}
          y1={HULL_TOP + HULL_H / 2}
          x2={HULL_RIGHT}
          y2={HULL_TOP + HULL_H / 2}
          stroke="#adb5bd"
          strokeWidth={1}
          strokeDasharray="4 3"
        />

        {/* Labels */}
        <text
          x={HULL_CX}
          y={HULL_TOP - 8}
          textAnchor="middle"
          fontSize={11}
          fill="#6c757d"
        >
          Bow
        </text>
        <text
          x={HULL_CX}
          y={HULL_BOTTOM + 16}
          textAnchor="middle"
          fontSize={11}
          fill="#6c757d"
        >
          Stern
        </text>
        <text
          x={HULL_LEFT - 4}
          y={HULL_TOP + HULL_H / 2}
          textAnchor="end"
          dominantBaseline="middle"
          fontSize={10}
          fill="#6c757d"
        >
          Port
        </text>
        <text
          x={HULL_RIGHT + 4}
          y={HULL_TOP + HULL_H / 2}
          textAnchor="start"
          dominantBaseline="middle"
          fontSize={10}
          fill="#6c757d"
        >
          Stbd
        </text>

        {/* GPS dots */}
        {sensors.map((sensor, index) => {
          const { x, y } = toSvgCoords(sensor.fromBow, sensor.fromCenter)
          const color = colors[index % colors.length]
          return (
            <g key={sensor.sensorId || index}>
              {/* Crosshair lines for the dragged dot */}
              {dragging === index && (
                <>
                  <line
                    x1={x}
                    y1={HULL_TOP}
                    x2={x}
                    y2={HULL_BOTTOM}
                    stroke={color}
                    strokeWidth={0.5}
                    strokeDasharray="3 3"
                    opacity={0.5}
                  />
                  <line
                    x1={HULL_LEFT}
                    y1={y}
                    x2={HULL_RIGHT}
                    y2={y}
                    stroke={color}
                    strokeWidth={0.5}
                    strokeDasharray="3 3"
                    opacity={0.5}
                  />
                </>
              )}
              <circle
                cx={x}
                cy={y}
                r={DOT_RADIUS}
                fill={color}
                stroke="#fff"
                strokeWidth={2}
                cursor="grab"
                onPointerDown={handlePointerDown(index)}
              />
              <text
                x={x + DOT_RADIUS + 4}
                y={y}
                dominantBaseline="middle"
                fontSize={10}
                fill={color}
                fontWeight="bold"
                pointerEvents="none"
              >
                {sensor.sensorId}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export default BoatSchematicEditor
