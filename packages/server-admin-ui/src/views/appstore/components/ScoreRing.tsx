import React from 'react'

interface ScoreRingProps {
  score?: number
  size?: number
  label?: string
}

function colorFor(score: number): string {
  if (score >= 70) return '#4dbd74'
  if (score >= 40) return '#f8cb00'
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
