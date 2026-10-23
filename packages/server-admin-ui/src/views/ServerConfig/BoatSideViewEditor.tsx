import React, { useRef, useState, useCallback } from 'react'

export interface SideViewSensor {
  sensorId: string
  $source: string
  fromBow: number | null
  fromWaterline: number | null
}

interface BoatSideViewEditorProps {
  sensors: readonly SideViewSensor[]
  vesselLength: number
  draft: number
  colors: string[]
  onUpdateSensor: (index: number, updates: { fromWaterline: number }) => void
}

const SVG_WIDTH = 380
const SVG_HEIGHT = 220
const MARKER_SIZE = 16

// The hull starts clear of the left edge so the waterline and draft
// labels sit in open water rather than across the bow.
const HULL_LEFT = 72
const HULL_RIGHT = SVG_WIDTH - 24
const HULL_W = HULL_RIGHT - HULL_LEFT
const DECK_Y = 40
const WATERLINE_Y = 80
const KEEL_Y = 190
const DRAFT_H = KEEL_Y - WATERLINE_Y
// Depth of the hull body below the waterline as a share of the draft; the
// rest is the keel fin, which is where the draft is measured.
const CANOE_BODY_SHARE = 0.4
const CANOE_Y = WATERLINE_Y + DRAFT_H * CANOE_BODY_SHARE
// Placement is rounded to this step, in metres: finer than the top view's
// 0.1 m, since a few centimetres matter for a depth below the waterline.
const DEPTH_STEP = 0.05

function buildHullPath(): string {
  const bow = HULL_LEFT
  const stern = HULL_RIGHT
  return [
    `M ${bow},${DECK_Y}`,
    `L ${stern},${DECK_Y}`,
    `L ${stern - 6},${CANOE_Y - 8}`,
    `Q ${stern - HULL_W * 0.15},${CANOE_Y} ${stern - HULL_W * 0.3},${CANOE_Y}`,
    `L ${bow + HULL_W * 0.3},${CANOE_Y}`,
    `Q ${bow + HULL_W * 0.08},${CANOE_Y} ${bow},${DECK_Y}`,
    'Z'
  ].join(' ')
}

function buildKeelPath(): string {
  const leadingTop = HULL_LEFT + HULL_W * 0.5
  const trailingTop = HULL_LEFT + HULL_W * 0.64
  return [
    `M ${leadingTop},${CANOE_Y}`,
    `L ${trailingTop},${CANOE_Y}`,
    `L ${trailingTop - 6},${KEEL_Y}`,
    `L ${leadingTop + 12},${KEEL_Y}`,
    'Z'
  ].join(' ')
}

const HULL_PATH = buildHullPath()
const KEEL_PATH = buildKeelPath()

/**
 * Side profile of the vessel for placing depth transducers below the
 * waterline. Dragging moves a transducer up and down only: where it sits
 * along the hull is set in the top view, and a transducer with no fromBow
 * yet is drawn amidships.
 */
const BoatSideViewEditor: React.FC<BoatSideViewEditorProps> = ({
  sensors,
  vesselLength,
  draft,
  colors,
  onUpdateSensor
}) => {
  const svgRef = useRef<SVGSVGElement>(null)
  const [dragging, setDragging] = useState<number | null>(null)

  const toSvgX = useCallback(
    (fromBow: number | null) => {
      const along = fromBow === null ? 0.5 : fromBow / vesselLength
      return HULL_LEFT + Math.max(0, Math.min(1, along)) * HULL_W
    },
    [vesselLength]
  )

  const toSvgY = useCallback(
    (fromWaterline: number) =>
      WATERLINE_Y +
      (Math.max(0, Math.min(draft, fromWaterline)) / draft) * DRAFT_H,
    [draft]
  )

  const toFromWaterline = useCallback(
    (svgY: number) => {
      const clamped = Math.max(WATERLINE_Y, Math.min(KEEL_Y, svgY))
      const depth = ((clamped - WATERLINE_Y) / DRAFT_H) * draft
      const stepped = Math.round(depth / DEPTH_STEP) * DEPTH_STEP
      return Math.round(Math.min(draft, stepped) * 100) / 100
    },
    [draft]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (dragging === null) return
      const svg = svgRef.current
      const ctm = svg?.getScreenCTM()
      if (!svg || !ctm) return
      const pt = svg.createSVGPoint()
      pt.x = e.clientX
      pt.y = e.clientY
      const { y } = pt.matrixTransform(ctm.inverse())
      onUpdateSensor(dragging, { fromWaterline: toFromWaterline(y) })
    },
    [dragging, toFromWaterline, onUpdateSensor]
  )

  const stopDragging = useCallback(() => setDragging(null), [])

  return (
    <svg
      ref={svgRef}
      width={SVG_WIDTH}
      height={SVG_HEIGHT}
      viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
      role="img"
      aria-label="Side view of the vessel for placing transducers below the waterline"
      onPointerMove={handlePointerMove}
      onPointerUp={stopDragging}
      onPointerLeave={stopDragging}
      style={{
        border: '1px solid #dee2e6',
        borderRadius: 4,
        cursor: dragging !== null ? 'grabbing' : 'default',
        touchAction: 'none'
      }}
    >
      <rect
        x={0}
        y={WATERLINE_Y}
        width={SVG_WIDTH}
        height={SVG_HEIGHT - WATERLINE_Y}
        fill="#e7f1ff"
      />
      <path d={HULL_PATH} fill="#f8f9fa" stroke="#6c757d" strokeWidth={1.5} />
      <path d={KEEL_PATH} fill="#f8f9fa" stroke="#6c757d" strokeWidth={1.5} />
      <line
        x1={0}
        y1={WATERLINE_Y}
        x2={SVG_WIDTH}
        y2={WATERLINE_Y}
        stroke="#0d6efd"
        strokeWidth={1}
      />
      <line
        x1={0}
        y1={KEEL_Y}
        x2={SVG_WIDTH}
        y2={KEEL_Y}
        stroke="#adb5bd"
        strokeWidth={1}
        strokeDasharray="4 3"
      />
      <text x={4} y={WATERLINE_Y - 4} fontSize={10} fill="#0d6efd">
        Waterline
      </text>
      <text x={4} y={KEEL_Y - 4} fontSize={10} fill="#6c757d">
        Draft {draft} m
      </text>
      <text
        x={HULL_LEFT}
        y={DECK_Y - 8}
        textAnchor="middle"
        fontSize={11}
        fill="#6c757d"
      >
        Bow
      </text>
      <text
        x={HULL_RIGHT}
        y={DECK_Y - 8}
        textAnchor="middle"
        fontSize={11}
        fill="#6c757d"
      >
        Stern
      </text>

      {sensors.map((sensor, index) => {
        const x = toSvgX(sensor.fromBow)
        const placed = sensor.fromWaterline !== null
        const y = toSvgY(sensor.fromWaterline ?? 0)
        const color = colors[index % colors.length]
        return (
          <g key={sensor.$source || `sensor-${index}`}>
            {dragging === index && (
              <line
                x1={0}
                y1={y}
                x2={SVG_WIDTH}
                y2={y}
                stroke={color}
                strokeWidth={0.5}
                strokeDasharray="3 3"
                opacity={0.6}
              />
            )}
            <rect
              x={x - MARKER_SIZE / 2}
              y={y - MARKER_SIZE / 2}
              width={MARKER_SIZE}
              height={MARKER_SIZE}
              fill={placed ? color : '#fff'}
              stroke={placed ? '#fff' : color}
              strokeWidth={2}
              cursor="grab"
              aria-label={`Depth of ${sensor.sensorId} below the waterline`}
              onPointerDown={(e) => {
                e.preventDefault()
                ;(e.currentTarget as SVGElement).setPointerCapture(e.pointerId)
                setDragging(index)
              }}
            />
            <text
              x={x + MARKER_SIZE / 2 + 4}
              y={y}
              dominantBaseline="middle"
              fontSize={10}
              fill={color}
              fontWeight="bold"
              pointerEvents="none"
              stroke="#fff"
              strokeWidth={3}
              paintOrder="stroke"
            >
              {sensor.sensorId}
              {placed ? ` ${sensor.fromWaterline} m` : ''}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export default BoatSideViewEditor
