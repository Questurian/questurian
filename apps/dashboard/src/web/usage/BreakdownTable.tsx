import type { GroupableDimension, UsageBreakdownRow } from "../../usage/types";
import { Empty } from "../components/primitives";
import {
  formatCost,
  formatDuration,
  formatExactCount,
  formatPercent,
  formatRelative,
  formatTokens,
  MISSING,
} from "../lib/format";

/**
 * Who is being called, and what it costs.
 *
 * Cost carries a separate "unpriced" count instead of an asterisk: a provider
 * with 400 unpriced calls and $0.00 recorded is not free, and the table has to
 * say which of the two it is.
 */
export function BreakdownTable({
  groupBy,
  rows,
  onSelect,
  selected,
}: {
  groupBy: GroupableDimension;
  rows: UsageBreakdownRow[];
  onSelect: (key: string) => void;
  selected: string | undefined;
}) {
  if (rows.length === 0) return <Empty>No calls in this window.</Empty>;

  const busiest = Math.max(...rows.map((row) => row.calls));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-left">
        <thead>
          <tr className="border-b border-line text-[10px] uppercase tracking-[0.12em] text-ink-faint">
            <th className="px-3 py-1.5 font-medium">{groupBy}</th>
            <th className="px-3 py-1.5 text-right font-medium">calls</th>
            <th className="px-3 py-1.5 text-right font-medium">errors</th>
            <th className="px-3 py-1.5 text-right font-medium">avg</th>
            <th className="px-3 py-1.5 text-right font-medium">p95</th>
            <th className="px-3 py-1.5 text-right font-medium">tokens</th>
            <th className="px-3 py-1.5 text-right font-medium">cost</th>
            <th className="px-3 py-1.5 text-right font-medium">last seen</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const errorRate = row.calls === 0 ? null : row.errors / row.calls;
            const isSelected = row.key === selected;
            return (
              <tr
                key={row.key}
                onClick={() => onSelect(row.key)}
                className={
                  "cursor-pointer border-b border-line-soft last:border-0 " +
                  (isSelected ? "bg-accent-soft/40" : "hover:bg-surface-raised/60")
                }
              >
                <td className="px-3 py-1.5">
                  <div className="flex items-center gap-2">
                    {/* A share bar, so relative volume reads without arithmetic. */}
                    <span className="hidden h-1 w-16 overflow-hidden rounded-sm bg-line sm:block">
                      <span
                        className="block h-full bg-accent"
                        style={{ width: `${Math.max(2, (row.calls / busiest) * 100)}%` }}
                      />
                    </span>
                    <span className="text-[12px] text-ink">{row.key}</span>
                  </div>
                </td>
                <td className="numeric px-3 py-1.5 text-right text-[12px] text-ink">
                  {formatExactCount(row.calls)}
                </td>
                <td
                  className={
                    "numeric px-3 py-1.5 text-right text-[12px] " +
                    (row.errors > 0 ? "text-bad" : "text-ink-faint")
                  }
                >
                  {row.errors > 0 ? `${row.errors} (${formatPercent(errorRate)})` : "0"}
                </td>
                <td className="numeric px-3 py-1.5 text-right text-[12px] text-ink-muted">
                  {formatDuration(row.avgDurationMs)}
                </td>
                <td className="numeric px-3 py-1.5 text-right text-[12px] text-ink-muted">
                  {formatDuration(row.p95DurationMs)}
                </td>
                <td className="numeric px-3 py-1.5 text-right text-[12px] text-ink-muted">
                  {/* A non-AI provider has no tokens at all; "0" would imply it
                      reported a count and the count was nothing. */}
                  {row.totalTokens > 0 ? formatTokens(row.totalTokens) : MISSING}
                </td>
                <td className="numeric px-3 py-1.5 text-right text-[12px] text-ink">
                  {row.pricedCalls > 0 ? (
                    formatCost(row.costUsd)
                  ) : (
                    <span className="text-ink-faint" title="no call here reported a price">
                      {MISSING}
                    </span>
                  )}
                  {row.unpricedCalls > 0 ? (
                    <span
                      className="ml-1 text-[10px] text-warn"
                      title={`${row.unpricedCalls} call(s) reported tokens but no price`}
                    >
                      {row.pricedCalls > 0 ? `+${row.unpricedCalls} unpriced` : `${row.unpricedCalls} unpriced`}
                    </span>
                  ) : null}
                </td>
                <td className="numeric px-3 py-1.5 text-right text-[11px] text-ink-faint">
                  {formatRelative(row.lastSeenTs)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
