import { useState } from "react";

interface BarChartPoint {
  label: string;
  value: number;
}

interface BarChartProps {
  points: BarChartPoint[];
  formatValue?: (value: number) => string;
  color?: string;
  height?: number;
}

export default function BarChart({
  points,
  formatValue = (v) => String(v),
  color = "#12C46B",
  height = 120
}: BarChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const max = Math.max(1, ...points.map((p) => p.value));
  const barGap = 2;
  const barWidth = points.length > 0 ? 100 / points.length : 0;

  return (
    <div className="relative">
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="h-28 w-full overflow-visible sm:h-32">
        {points.map((p, i) => {
          const barHeight = max > 0 ? (p.value / max) * (height - 4) : 0;
          const x = i * barWidth + barGap / 2;
          const w = Math.max(barWidth - barGap, 0.5);
          const isHovered = hoverIndex === i;
          return (
            <rect
              key={i}
              x={x}
              y={height - barHeight}
              width={w}
              height={Math.max(barHeight, p.value > 0 ? 1.5 : 0.5)}
              rx={0.6}
              fill={color}
              opacity={p.value === 0 ? 0.15 : isHovered ? 1 : 0.75}
              onMouseEnter={() => setHoverIndex(i)}
              onMouseLeave={() => setHoverIndex((v) => (v === i ? null : v))}
              className="transition-opacity"
            />
          );
        })}
      </svg>
      {hoverIndex !== null && points[hoverIndex] && (
        <div
          className="pointer-events-none absolute -top-1 left-0 -translate-y-full rounded-md border border-base-700 bg-base-950 px-2 py-1 text-xs text-zinc-200 shadow-lg"
          style={{ left: `${(hoverIndex + 0.5) * barWidth}%`, transform: "translate(-50%, -100%)" }}
        >
          <div className="whitespace-nowrap font-medium">{formatValue(points[hoverIndex].value)}</div>
          <div className="whitespace-nowrap text-[10px] text-zinc-500">{points[hoverIndex].label}</div>
        </div>
      )}
    </div>
  );
}
