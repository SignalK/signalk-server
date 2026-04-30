import React from 'react'

interface ScoreRingProps {
  score?: number
  size?: number
  label?: string
}

// Score-tier thresholds. Match the heuristic-disclaimer copy on the
// IndicatorsTab — a low score isn't a verdict, just a feedback hint
// for plugin authors. The cutoffs mirror what the registry's nightly
// scoring uses.
const SCORE_GREEN_THRESHOLD = 70
const SCORE_YELLOW_THRESHOLD = 40

function colorFor(score: number): string {
  if (score >= SCORE_GREEN_THRESHOLD) return '#4dbd74'
  if (score >= SCORE_YELLOW_THRESHOLD) return '#f8cb00'
  return '#f86c6b'
}

const ScoreRing: React.FC<ScoreRingProps> = ({
  score,
  size = 34,
  label = 'Indicator score'
}) => {
  if (typeof score !== 'number' || !Number.isFinite(score)) return null
  const clamped = Math.max(0, Math.min(100, Math.round(score)))
  const radius = size / 2 - 3
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - clamped / 100)
  const color = colorFor(clamped)
  return (
    <svg
      width={size}
      height={size}
      role="img"
      aria-label={`${label} ${clamped} of 100`}
      style={{ display: 'block' }}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="#e4e7ea"
        strokeWidth={3}
        fill="none"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={color}
        strokeWidth={3}
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        style={{ fontSize: size * 0.35, fontWeight: 600, fill: '#2f353a' }}
      >
        {clamped}
      </text>
    </svg>
  )
}

export default ScoreRing
