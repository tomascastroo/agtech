'use client';

import { useMemo, useRef, useState } from 'react';
import styles from './charts.module.css';

export interface LinePoint {
  x: Date;
  y: number;
  label?: string;
}

const WIDTH = 640;
const HEIGHT = 200;
const PAD = { top: 16, right: 16, bottom: 28, left: 44 };

/**
 * Serie temporal única con crosshair y tooltip. Un eje, grilla recesiva, línea de 2 px,
 * marcadores de 8 px y área de interacción mayor que la marca.
 */
export function LineChart({
  points,
  formatY,
  formatX,
  yDomain,
  label,
}: {
  points: LinePoint[];
  formatY: (value: number) => string;
  formatX: (value: Date) => string;
  yDomain?: [number, number];
  label: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const geometry = useMemo(() => {
    const xs = points.map((p) => p.x.getTime());
    const ys = points.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const [minY, maxY] = yDomain ?? [Math.min(...ys) * 0.95, Math.max(...ys) * 1.05];
    const sx = (x: number) =>
      PAD.left +
      (maxX === minX ? 0.5 : (x - minX) / (maxX - minX)) * (WIDTH - PAD.left - PAD.right);
    const sy = (y: number) =>
      PAD.top + (1 - (y - minY) / (maxY - minY || 1)) * (HEIGHT - PAD.top - PAD.bottom);
    const ticks = Array.from({ length: 4 }, (_, i) => minY + ((maxY - minY) * i) / 3);
    return { sx, sy, ticks, coords: points.map((p) => [sx(p.x.getTime()), sy(p.y)] as const) };
  }, [points, yDomain]);

  if (points.length === 0) return null;
  const path = geometry.coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ');

  const onMove = (event: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * WIDTH;
    let nearest = 0;
    geometry.coords.forEach(([cx], i) => {
      if (Math.abs(cx - x) < Math.abs(geometry.coords[nearest]![0] - x)) nearest = i;
    });
    setHover(nearest);
  };

  const active = hover !== null ? points[hover] : null;
  const activeCoords = hover !== null ? geometry.coords[hover] : null;

  return (
    <div className={styles.chart}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={label}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {geometry.ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={geometry.sy(tick)}
              y2={geometry.sy(tick)}
              stroke="var(--color-grid)"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 8}
              y={geometry.sy(tick) + 4}
              textAnchor="end"
              className={styles.axisLabel}
            >
              {formatY(tick)}
            </text>
          </g>
        ))}
        <line
          x1={PAD.left}
          x2={WIDTH - PAD.right}
          y1={HEIGHT - PAD.bottom}
          y2={HEIGHT - PAD.bottom}
          stroke="var(--color-axis)"
        />
        {[0, points.length - 1]
          .filter((v, i, a) => a.indexOf(v) === i)
          .map((i) => (
            <text
              key={i}
              x={geometry.coords[i]![0]}
              y={HEIGHT - 8}
              textAnchor={i === 0 ? 'start' : 'end'}
              className={styles.axisLabel}
            >
              {formatX(points[i]!.x)}
            </text>
          ))}
        <path
          d={path}
          fill="none"
          stroke="var(--color-data-1)"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        {geometry.coords.map(([x, y], i) => (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={4}
            fill="var(--color-data-1)"
            stroke="var(--color-surface)"
            strokeWidth={2}
          />
        ))}
        {activeCoords ? (
          <>
            <line
              x1={activeCoords[0]}
              x2={activeCoords[0]}
              y1={PAD.top}
              y2={HEIGHT - PAD.bottom}
              stroke="var(--color-axis)"
            />
            <circle
              cx={activeCoords[0]}
              cy={activeCoords[1]}
              r={6}
              fill="var(--color-data-1)"
              stroke="var(--color-surface)"
              strokeWidth={2}
            />
          </>
        ) : null}
        <rect
          x={PAD.left}
          y={0}
          width={WIDTH - PAD.left - PAD.right}
          height={HEIGHT}
          fill="transparent"
        />
      </svg>
      {active && activeCoords ? (
        <div
          className={styles.tooltip}
          style={{
            left: `${(activeCoords[0] / WIDTH) * 100}%`,
            top: `${(activeCoords[1] / HEIGHT) * 100}%`,
          }}
        >
          <strong>{formatY(active.y)}</strong>
          {active.label ?? formatX(active.x)}
        </div>
      ) : null}
    </div>
  );
}
