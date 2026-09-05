import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SeriesBucket, UsageSeries } from "../../usage/types";
import { formatBucketTick, formatCost, formatCount, formatDateTime } from "../lib/format";

/**
 * Two charts, both reading the same `/series` shape.
 *
 * Volume is a stacked bar because calls are discrete events counted per
 * bucket, and stacking answers "who did that spike belong to". Cost is an
 * area because money accumulates and the eye should follow its slope.
 *
 * Entry animation is off. The panels refetch every ten seconds, so animating
 * each arrival means the charts spend a visible share of their life mid-draw
 * -- and a chart you cannot trust to be finished is a chart you re-read.
 */

const SERIES_COLORS = [
  "var(--color-series-1)",
  "var(--color-series-2)",
  "var(--color-series-3)",
  "var(--color-series-4)",
  "var(--color-series-5)",
  "var(--color-series-6)",
  "var(--color-series-7)",
  "var(--color-series-8)",
  "var(--color-series-9)",
];

const AXIS_STYLE = { fill: "var(--color-ink-faint)", fontSize: 10 } as const;
const GRID_COLOR = "var(--color-line-soft)";

function tooltipContent(
  bucket: SeriesBucket,
  formatValue: (value: number) => string,
): NonNullable<Parameters<typeof Tooltip>[0]>["content"] {
  return ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const total = payload.reduce((sum, entry) => sum + (Number(entry.value) || 0), 0);
    return (
      <div className="rounded border border-line bg-surface-raised px-2.5 py-2 shadow-lg">
        <div className="numeric mb-1 text-[11px] text-ink-muted">
          {formatDateTime(Number(label))}
        </div>
        {payload
          .filter((entry) => Number(entry.value) > 0)
          .reverse()
          .map((entry) => (
            <div key={String(entry.name)} className="flex items-center gap-2 text-[11px]">
              <span
                className="inline-block size-2 rounded-sm"
                style={{ background: String(entry.color) }}
              />
              <span className="flex-1 text-ink-muted">{String(entry.name)}</span>
              <span className="numeric text-ink">{formatValue(Number(entry.value))}</span>
            </div>
          ))}
        {payload.length > 1 ? (
          <div className="mt-1 flex items-center gap-2 border-t border-line-soft pt-1 text-[11px]">
            <span className="flex-1 text-ink-faint">total</span>
            <span className="numeric text-ink">{formatValue(total)}</span>
          </div>
        ) : null}
        <div className="mt-1 text-[10px] text-ink-faint">per {bucket}</div>
      </div>
    );
  };
}

export function VolumeChart({ series }: { series: UsageSeries }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={series.rows} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
        <CartesianGrid stroke={GRID_COLOR} vertical={false} />
        <XAxis
          dataKey="bucket"
          tick={AXIS_STYLE}
          tickLine={false}
          axisLine={{ stroke: GRID_COLOR }}
          tickFormatter={(value: number) => formatBucketTick(value, series.bucket)}
          minTickGap={28}
        />
        <YAxis
          tick={AXIS_STYLE}
          tickLine={false}
          axisLine={false}
          width={38}
          tickFormatter={(value: number) => formatCount(value)}
        />
        <Tooltip content={tooltipContent(series.bucket, formatCount)} />
        {series.keys.length > 1 ? (
          <Legend
            wrapperStyle={{ fontSize: 11, color: "var(--color-ink-muted)", paddingTop: 4 }}
            iconType="square"
            iconSize={8}
          />
        ) : null}
        {series.keys.map((key, index) => (
          <Bar
            key={key}
            dataKey={key}
            name={key}
            stackId="calls"
            fill={SERIES_COLORS[index % SERIES_COLORS.length]}
            maxBarSize={26}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CostChart({ series }: { series: UsageSeries }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={series.rows} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
        <defs>
          {series.keys.map((key, index) => (
            <linearGradient key={key} id={`cost-${index}`} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor={SERIES_COLORS[index % SERIES_COLORS.length]}
                stopOpacity={0.5}
              />
              <stop
                offset="100%"
                stopColor={SERIES_COLORS[index % SERIES_COLORS.length]}
                stopOpacity={0.05}
              />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid stroke={GRID_COLOR} vertical={false} />
        <XAxis
          dataKey="bucket"
          tick={AXIS_STYLE}
          tickLine={false}
          axisLine={{ stroke: GRID_COLOR }}
          tickFormatter={(value: number) => formatBucketTick(value, series.bucket)}
          minTickGap={28}
        />
        <YAxis
          tick={AXIS_STYLE}
          tickLine={false}
          axisLine={false}
          width={52}
          tickFormatter={(value: number) => formatCost(value)}
        />
        <Tooltip content={tooltipContent(series.bucket, formatCost)} />
        {series.keys.length > 1 ? (
          <Legend
            wrapperStyle={{ fontSize: 11, color: "var(--color-ink-muted)", paddingTop: 4 }}
            iconType="square"
            iconSize={8}
          />
        ) : null}
        {series.keys.map((key, index) => (
          <Area
            key={key}
            type="monotone"
            dataKey={key}
            name={key}
            stackId="cost"
            stroke={SERIES_COLORS[index % SERIES_COLORS.length]}
            strokeWidth={1.5}
            fill={`url(#cost-${index})`}
            isAnimationActive={false}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
