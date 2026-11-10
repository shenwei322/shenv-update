import { useRef, useState } from 'react'
import { useBarGrow } from '../lib/gsap'
import { formatDay } from '../lib/format'
import type { StatPoint } from '../lib/types'

interface ActivityChartProps {
  series: StatPoint[]
}

export function ActivityChart({ series }: ActivityChartProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [hovered, setHovered] = useState<number | null>(null)

  useBarGrow(
    ref,
    series.length ? series.map((point) => `${point.checks}:${point.launches}`).join('|') : 'empty',
  )

  const max = Math.max(1, ...series.map((point) => Math.max(point.checks, point.launches)))

  return (
    <div className="chart-wrap">
      <div className="chart" ref={ref}>
        {series.map((point, index) => (
          <div
            className="chart-col"
            key={point.day}
            onMouseEnter={() => setHovered(index)}
            onMouseLeave={() => setHovered(null)}
          >
            {hovered === index ? (
              <div className="chart-tip" role="tooltip">
                <strong>{point.day}</strong>
                <span>更新检查 {point.checks}</span>
                <span>启动 {point.launches}</span>
              </div>
            ) : null}
            <div className="chart-bars">
              <span
                className="chart-bar chart-bar-checks"
                data-bar
                style={{ height: `${Math.max(2, (point.checks / max) * 100)}%` }}
              />
              <span
                className="chart-bar chart-bar-launches"
                data-bar
                style={{ height: `${Math.max(2, (point.launches / max) * 100)}%` }}
              />
            </div>
            <span className="chart-day">{formatDay(point.day)}</span>
          </div>
        ))}
      </div>
      <div className="chart-legend">
        <span className="legend-item">
          <span className="legend-dot legend-dot-checks" />
          更新检查
        </span>
        <span className="legend-item">
          <span className="legend-dot legend-dot-launches" />
          启动次数
        </span>
      </div>
    </div>
  )
}
