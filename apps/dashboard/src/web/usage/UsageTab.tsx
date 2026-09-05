import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchBreakdown,
  fetchEvents,
  fetchFacets,
  fetchSeries,
  fetchSummary,
  type UsageQuery,
} from "../lib/api";
import {
  Empty,
  ErrorNote,
  Field,
  Loading,
  Panel,
  SegmentedControl,
  Select,
  StatTile,
} from "../components/primitives";
import {
  formatCost,
  formatDuration,
  formatExactCount,
  formatPercent,
  formatRelative,
  formatTokens,
  MISSING,
} from "../lib/format";
import { BreakdownTable } from "./BreakdownTable";
import { EventsTable } from "./EventsTable";
import { CostChart, VolumeChart } from "./charts";
import type { GroupableDimension, SeriesBucket } from "../../usage/types";

/**
 * The API monitor.
 *
 * One filter drives every panel, so the tiles, the charts and both tables are
 * always describing the same slice -- a dashboard whose halves answer for
 * different windows is worse than no dashboard.
 */

const WINDOWS = [
  { value: "1h", label: "1h", bucket: "minute" as SeriesBucket },
  { value: "24h", label: "24h", bucket: "hour" as SeriesBucket },
  { value: "7d", label: "7d", bucket: "hour" as SeriesBucket },
  { value: "30d", label: "30d", bucket: "day" as SeriesBucket },
] as const;

const DIMENSIONS: readonly { value: GroupableDimension; label: string }[] = [
  { value: "provider", label: "provider" },
  { value: "service", label: "service" },
  { value: "feature", label: "feature" },
  { value: "model", label: "model" },
];

const EVENT_PAGE_SIZE = 50;

export function UsageTab() {
  const [window, setWindow] = useState<(typeof WINDOWS)[number]["value"]>("24h");
  const [service, setService] = useState("");
  const [provider, setProvider] = useState("");
  const [feature, setFeature] = useState("");
  const [model, setModel] = useState("");
  const [status, setStatus] = useState("");
  const [correlationId, setCorrelationId] = useState("");
  const [groupBy, setGroupBy] = useState<GroupableDimension>("provider");
  const [cursor, setCursor] = useState<string | null>(null);

  const query: UsageQuery = useMemo(
    () => ({
      window,
      service: service || undefined,
      provider: provider || undefined,
      feature: feature || undefined,
      model: model || undefined,
      status: status || undefined,
      correlationId: correlationId || undefined,
    }),
    [window, service, provider, feature, model, status, correlationId],
  );

  const bucket = WINDOWS.find((entry) => entry.value === window)!.bucket;
  const key = ["usage", query] as const;

  // Facets come from the whole retained history, not the current window: a
  // provider that went quiet must stay selectable, otherwise its absence
  // cannot be investigated.
  const facets = useQuery({ queryKey: ["facets"], queryFn: () => fetchFacets({ window: "30d" }) });
  const summary = useQuery({ queryKey: [...key, "summary"], queryFn: () => fetchSummary(query) });
  const volume = useQuery({
    queryKey: [...key, "volume", bucket, groupBy],
    queryFn: () => fetchSeries(query, { bucket, metric: "calls", groupBy }),
  });
  const cost = useQuery({
    queryKey: [...key, "cost", bucket, groupBy],
    queryFn: () => fetchSeries(query, { bucket, metric: "cost", groupBy }),
  });
  const breakdown = useQuery({
    queryKey: [...key, "breakdown", groupBy],
    queryFn: () => fetchBreakdown(query, groupBy),
  });
  const events = useQuery({
    queryKey: [...key, "events", cursor],
    queryFn: () => fetchEvents(query, { limit: EVENT_PAGE_SIZE, cursor }),
  });

  const resetPaging = () => setCursor(null);

  const setDimensionValue = (dimension: GroupableDimension, value: string) => {
    resetPaging();
    if (dimension === "provider") setProvider(value);
    if (dimension === "service") setService(value);
    if (dimension === "feature") setFeature(value);
    if (dimension === "model") setModel(value);
  };

  const selectedForDimension = { provider, service, feature, model }[groupBy];

  const filtersActive = Boolean(
    service || provider || feature || model || status || correlationId,
  );

  const clearFilters = () => {
    resetPaging();
    setService("");
    setProvider("");
    setFeature("");
    setModel("");
    setStatus("");
    setCorrelationId("");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-line bg-surface px-3 py-2">
        <SegmentedControl
          value={window}
          onChange={(next) => {
            resetPaging();
            setWindow(next);
          }}
          options={WINDOWS.map((entry) => ({ value: entry.value, label: entry.label }))}
        />

        <Field label="service">
          <Select
            value={service}
            onChange={(value) => setDimensionValue("service", value)}
            anyLabel="any"
            options={(facets.data?.services ?? []).map((value) => ({ value, label: value }))}
          />
        </Field>
        <Field label="provider">
          <Select
            value={provider}
            onChange={(value) => setDimensionValue("provider", value)}
            anyLabel="any"
            options={(facets.data?.providers ?? []).map((value) => ({ value, label: value }))}
          />
        </Field>
        <Field label="feature">
          <Select
            value={feature}
            onChange={(value) => setDimensionValue("feature", value)}
            anyLabel="any"
            options={(facets.data?.features ?? []).map((value) => ({ value, label: value }))}
          />
        </Field>
        <Field label="model">
          <Select
            value={model}
            onChange={(value) => setDimensionValue("model", value)}
            anyLabel="any"
            options={(facets.data?.models ?? []).map((value) => ({ value, label: value }))}
          />
        </Field>
        <Field label="status">
          <Select
            value={status}
            onChange={(value) => {
              resetPaging();
              setStatus(value);
            }}
            anyLabel="any"
            options={[
              { value: "ok", label: "ok" },
              { value: "error", label: "error" },
            ]}
          />
        </Field>

        {correlationId ? (
          <span className="numeric flex items-center gap-1.5 rounded border border-accent-soft bg-accent-soft/40 px-2 py-1 text-[11px] text-ink">
            run {correlationId}
            <button
              type="button"
              onClick={() => {
                resetPaging();
                setCorrelationId("");
              }}
              className="text-ink-faint hover:text-ink"
              aria-label="clear correlation filter"
            >
              ×
            </button>
          </span>
        ) : null}

        {filtersActive ? (
          <button
            type="button"
            onClick={clearFilters}
            className="text-[11px] text-accent hover:underline"
          >
            clear filters
          </button>
        ) : null}

        <span className="ml-auto text-[11px] text-ink-faint">
          {summary.data?.lastEventTs
            ? `last event ${formatRelative(summary.data.lastEventTs)}`
            : "no events yet"}
        </span>
      </div>

      {summary.isError ? <ErrorNote error={summary.error} /> : null}

      {summary.data && summary.data.seededCalls > 0 ? (
        // Loud on purpose. Synthetic data read as real is the one failure mode
        // of this whole page that produces confident wrong conclusions.
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-warn/50 bg-warn/10 px-3 py-2 text-[12px] text-warn">
          <span className="font-semibold uppercase tracking-[0.1em]">Synthetic data</span>
          <span className="text-ink-muted">
            {formatExactCount(summary.data.seededCalls)} of{" "}
            {formatExactCount(summary.data.calls)} events in this window came from
            <span className="numeric"> pnpm seed:usage</span>, not from a real API call.
            Nothing here is a measurement.
          </span>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="calls"
          value={formatExactCount(summary.data?.calls)}
          hint={
            summary.data?.firstEventTs
              ? `since ${formatRelative(summary.data.firstEventTs)}`
              : undefined
          }
        />
        <StatTile
          label="errors"
          value={formatExactCount(summary.data?.errors)}
          tone={
            summary.data?.errorRate === null || summary.data?.errorRate === undefined
              ? "neutral"
              : summary.data.errorRate > 0.05
                ? "bad"
                : summary.data.errorRate > 0
                  ? "warn"
                  : "ok"
          }
          hint={`${formatPercent(summary.data?.errorRate)} of calls`}
        />
        <StatTile
          label="est. cost"
          value={
            summary.data && summary.data.pricedCalls === 0
              ? MISSING
              : formatCost(summary.data?.costUsd)
          }
          tone="neutral"
          hint={
            summary.data?.unpricedCalls
              ? `${summary.data.unpricedCalls} of ${formatExactCount(summary.data.calls)} calls unpriced`
              : summary.data?.pricedCalls === 0
                ? "no call reported a price"
                : "priced calls only"
          }
        />
        <StatTile
          label="tokens"
          value={
            summary.data && summary.data.tokens.total === 0
              ? MISSING
              : formatTokens(summary.data?.tokens.total)
          }
          hint={
            summary.data
              ? `p95 ${formatDuration(summary.data.durationMs.p95)} · max ${formatDuration(
                  summary.data.durationMs.max,
                )}`
              : undefined
          }
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <Panel
          title="Calls over time"
          note={`per ${bucket}, by ${groupBy}`}
          actions={
            <SegmentedControl
              value={groupBy}
              onChange={(next) => setGroupBy(next)}
              options={DIMENSIONS}
            />
          }
        >
          <div className="p-2">
            {volume.isError ? (
              <ErrorNote error={volume.error} />
            ) : !volume.data ? (
              <Loading />
            ) : volume.data.keys.length === 0 ? (
              <Empty>No calls in this window.</Empty>
            ) : (
              <VolumeChart series={volume.data} />
            )}
          </div>
        </Panel>

        <Panel title="Cost over time" note={`per ${bucket}, priced calls only`}>
          <div className="p-2">
            {cost.isError ? (
              <ErrorNote error={cost.error} />
            ) : !cost.data ? (
              <Loading />
            ) : cost.data.keys.length === 0 ? (
              // Distinguished from "no calls": plenty may have run, and none of
              // them came back with a price.
              <Empty>No priced calls in this window.</Empty>
            ) : (
              <CostChart series={cost.data} />
            )}
          </div>
        </Panel>
      </div>

      <Panel
        title={`By ${groupBy}`}
        note="click a row to filter everything by it"
        actions={
          <SegmentedControl value={groupBy} onChange={(next) => setGroupBy(next)} options={DIMENSIONS} />
        }
      >
        {breakdown.isError ? (
          <ErrorNote error={breakdown.error} />
        ) : breakdown.data ? (
          <BreakdownTable
            groupBy={breakdown.data.groupBy}
            rows={breakdown.data.rows}
            selected={selectedForDimension || undefined}
            onSelect={(rowKey) =>
              setDimensionValue(groupBy, selectedForDimension === rowKey ? "" : rowKey)
            }
          />
        ) : (
          <Loading />
        )}
      </Panel>

      <Panel
        title="Recent calls"
        note={cursor ? "older page" : "newest first"}
        actions={
          <div className="flex items-center gap-2">
            {cursor ? (
              <button
                type="button"
                onClick={resetPaging}
                className="text-[11px] text-accent hover:underline"
              >
                newest
              </button>
            ) : null}
            <button
              type="button"
              disabled={!events.data?.nextCursor}
              onClick={() => setCursor(events.data?.nextCursor ?? null)}
              className="text-[11px] text-accent hover:underline disabled:text-ink-faint disabled:no-underline"
            >
              older
            </button>
          </div>
        }
      >
        {events.isError ? (
          <ErrorNote error={events.error} />
        ) : events.data ? (
          <EventsTable
            rows={events.data.rows}
            onFilterCorrelation={(value) => {
              resetPaging();
              setCorrelationId(value);
            }}
          />
        ) : (
          <Loading />
        )}
      </Panel>
    </div>
  );
}
