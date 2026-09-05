import { Fragment, useState } from "react";
import type { UsageEventRow } from "../../usage/types";
import { Empty, StatusBadge } from "../components/primitives";
import {
  formatCost,
  formatClock,
  formatDuration,
  formatTokens,
  MISSING,
} from "../lib/format";

/**
 * The raw log, newest first.
 *
 * A failed call's message is the reason anyone opens this table, so a row with
 * an error expands in place rather than hiding it behind a detail view.
 */
export function EventsTable({
  rows,
  onFilterCorrelation,
}: {
  rows: UsageEventRow[];
  onFilterCorrelation: (correlationId: string) => void;
}) {
  const [expanded, setExpanded] = useState<number | null>(null);

  if (rows.length === 0) return <Empty>No events in this window.</Empty>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] border-collapse text-left">
        <thead>
          <tr className="border-b border-line text-[10px] uppercase tracking-[0.12em] text-ink-faint">
            <th className="px-3 py-1.5 font-medium">time</th>
            <th className="px-3 py-1.5 font-medium">service</th>
            <th className="px-3 py-1.5 font-medium">provider</th>
            <th className="px-3 py-1.5 font-medium">model / endpoint</th>
            <th className="px-3 py-1.5 font-medium">feature</th>
            <th className="px-3 py-1.5 text-right font-medium">duration</th>
            <th className="px-3 py-1.5 text-right font-medium">tokens</th>
            <th className="px-3 py-1.5 text-right font-medium">cost</th>
            <th className="px-3 py-1.5 font-medium">status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isOpen = expanded === row.id;
            const hasDetail = row.status === "error" || row.metadata !== null;
            return (
              <Fragment key={row.id}>
                <tr
                  onClick={() => setExpanded(isOpen ? null : row.id)}
                  className={
                    "border-b border-line-soft " +
                    (hasDetail ? "cursor-pointer " : "") +
                    (row.status === "error" ? "bg-bad/[0.06] " : "") +
                    "hover:bg-surface-raised/60"
                  }
                >
                  <td className="numeric px-3 py-1.5 text-[11px] text-ink-muted">
                    {formatClock(row.ts)}
                  </td>
                  <td className="px-3 py-1.5 text-[12px] text-ink-muted">{row.service}</td>
                  <td className="px-3 py-1.5 text-[12px] text-ink">{row.provider}</td>
                  <td className="numeric px-3 py-1.5 text-[11px] text-ink-muted">
                    {row.model ?? row.endpoint ?? MISSING}
                  </td>
                  <td className="px-3 py-1.5 text-[11px] text-ink-faint">
                    {row.feature ?? MISSING}
                  </td>
                  <td className="numeric px-3 py-1.5 text-right text-[12px] text-ink-muted">
                    {formatDuration(row.durationMs)}
                  </td>
                  <td className="numeric px-3 py-1.5 text-right text-[12px] text-ink-muted">
                    {formatTokens(row.tokens.total)}
                  </td>
                  <td className="numeric px-3 py-1.5 text-right text-[12px] text-ink">
                    {row.costUsd === null && (row.tokens.total ?? 0) > 0 ? (
                      <span className="text-warn" title="tokens reported, no price">
                        unpriced
                      </span>
                    ) : (
                      formatCost(row.costUsd)
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    <StatusBadge status={row.status} />
                  </td>
                </tr>

                {isOpen ? (
                  <tr className="border-b border-line-soft bg-surface-raised/40">
                    <td colSpan={9} className="px-3 py-2">
                      <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                        {row.status === "error" ? (
                          <Detail label="error">
                            <span className="text-bad">
                              {row.errorKind ? `${row.errorKind}: ` : ""}
                              {row.errorMessage ?? "no message recorded"}
                            </span>
                          </Detail>
                        ) : null}
                        {row.httpStatus !== null ? (
                          <Detail label="http">{row.httpStatus}</Detail>
                        ) : null}
                        {row.correlationId ? (
                          <Detail label="correlation">
                            <button
                              type="button"
                              onClick={(clickEvent) => {
                                clickEvent.stopPropagation();
                                onFilterCorrelation(row.correlationId!);
                              }}
                              className="text-accent hover:underline"
                            >
                              {row.correlationId}
                            </button>
                          </Detail>
                        ) : null}
                        {row.costBasis ? <Detail label="cost basis">{row.costBasis}</Detail> : null}
                        {row.tokens.total !== null ? (
                          <Detail label="tokens">
                            in {formatTokens(row.tokens.input)} · out{" "}
                            {formatTokens(row.tokens.output)} · cached{" "}
                            {formatTokens(row.tokens.cachedInput)} · reasoning{" "}
                            {formatTokens(row.tokens.reasoning)}
                          </Detail>
                        ) : null}
                        {row.eventId ? <Detail label="event id">{row.eventId}</Detail> : null}
                        {row.metadata ? (
                          <Detail label="metadata" wide>
                            <pre className="numeric overflow-x-auto whitespace-pre-wrap text-[11px] text-ink-muted">
                              {JSON.stringify(row.metadata, null, 2)}
                            </pre>
                          </Detail>
                        ) : null}
                      </dl>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Detail({
  label,
  children,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-[10px] uppercase tracking-[0.12em] text-ink-faint">{label}</dt>
      <dd className="numeric text-[11px] text-ink-muted">{children}</dd>
    </div>
  );
}
