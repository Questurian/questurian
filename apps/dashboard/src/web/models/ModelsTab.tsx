import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchJobSettings,
  fetchListeners,
  resetJobModel,
  setJobModel,
  type JobSetting,
  type ListenerStatus,
} from "../lib/api";
import { Panel } from "../components/primitives";

/**
 * Which model each job runs on.
 *
 * Every other view here answers a question about the past. This one changes
 * something: the apps read this table at startup and refresh it on a timer, so
 * a change here moves a running pipeline onto a different model without a code
 * edit, a restart or a deploy.
 *
 * It is still not a gateway. Nothing routes through the dashboard -- it
 * publishes a table, and each app's own gateway caches it and falls back to its
 * checked-in defaults when this is unreachable. Changing a model here cannot
 * stop a call; it can only change which model the next one asks for.
 *
 * The rows are grouped by app because the two apps fail differently: a
 * Prompt2Blog stage on the wrong model produces a worse article, and a Location
 * Manager job on the wrong model quietly costs eight times as much per image.
 */

/**
 * Whether an app is really reading this table.
 *
 * Serving a table and having it read are different facts. For an entire
 * rollout only the first was visible here, and one app was quietly ignoring
 * everything this screen did.
 */
function ListenerBanner({ status }: { status: ListenerStatus | undefined }) {
  if (!status) return null;

  if (!status.reachable) {
    return (
      <p className="px-3 py-2 text-[11px] text-ink-faint">
        Not running. It will read this table when it next starts; until then
        nothing here reaches it.
      </p>
    );
  }

  if (status.tableSource !== "dashboard") {
    return (
      <p className="px-3 py-2 text-[11px] text-bad">
        Running, but <b>not reading this table</b> — it is using the models
        compiled into it, so changes here will not reach it.
        {status.settingsUrl
          ? ` It is pointed at ${status.settingsUrl}.`
          : " No settings URL is configured for it."}
      </p>
    );
  }

  const pinned = Object.keys(status.pinnedJobs ?? {});
  return (
    <p className="px-3 py-2 text-[11px] text-ink-faint">
      Reading this table.
      {pinned.length > 0 ? (
        <span className="text-warn">
          {" "}
          {pinned.length} job{pinned.length === 1 ? "" : "s"} pinned by an
          environment variable, which this dashboard cannot change.
        </span>
      ) : null}
    </p>
  );
}

function noteFor(jobs: JobSetting[]) {
  const moved = jobs.filter((job) => job.overridden).length;
  const total = jobs.length;
  return moved === 0 ? `${total} jobs, all on their defaults` : `${total} jobs, ${moved} changed`;
}

function relativeDay(iso: string | null) {
  if (!iso) return null;
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (!Number.isFinite(days)) return null;
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

function JobRow({
  job,
  offered,
  onChange,
  onReset,
  busy,
  pinnedTo,
}: {
  job: JobSetting;
  offered: string[];
  onChange: (model: string) => void;
  onReset: () => void;
  busy: boolean;
  pinnedTo?: string;
}) {
  // A model somebody set by hand that is not on the offered list still has to
  // appear in the dropdown, or opening the row would silently propose changing
  // it.
  const options = useMemo(() => {
    const seen = new Set(offered);
    if (job.model) seen.add(job.model);
    if (job.defaultModel) seen.add(job.defaultModel);
    return [...seen].sort();
  }, [offered, job.model, job.defaultModel]);

  if (!job.configurable) {
    return (
      <tr className="border-t border-line-soft">
        <td className="px-3 py-2 align-top">
          <div className="numeric text-[12px] text-ink">{job.id}</div>
          <div className="text-[11px] text-ink-faint">{job.summary}</div>
        </td>
        <td className="px-3 py-2 align-top text-[11px] text-ink-faint" colSpan={2}>
          No model behind this call — it reaches Google Places directly.
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t border-line-soft">
      <td className="px-3 py-2 align-top">
        <div className="numeric text-[12px] text-ink">{job.id}</div>
        <div className="text-[11px] text-ink-faint">{job.summary}</div>
        <div className="numeric mt-0.5 text-[10px] text-ink-faint">{job.site}</div>
      </td>
      <td className="px-3 py-2 align-top">
        <select
          value={pinnedTo ?? job.model ?? ""}
          disabled={busy || pinnedTo !== undefined}
          onChange={(event) => onChange(event.target.value)}
          className="numeric w-full rounded border border-line bg-surface-raised px-2 py-1 text-[12px] text-ink disabled:opacity-50"
        >
          {options.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2 align-top text-[11px]">
        {pinnedTo ? (
          <div className="mb-1 text-warn">
            pinned to <span className="numeric">{pinnedTo}</span> by an
            environment variable on that machine
            <span className="text-ink-faint">
              {" "}
              — this dashboard cannot change it
            </span>
          </div>
        ) : null}
        {job.servedBy ? (
          <div className="mb-1 text-warn">
            really runs on <span className="numeric">{job.servedBy}</span>
            <span className="text-ink-faint"> — no Claude path is switched on</span>
          </div>
        ) : null}
        {job.overridden ? (
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-warn">
              changed {relativeDay(job.changedAt) ?? ""}
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={onReset}
              className="rounded border border-line px-1.5 py-0.5 text-[11px] text-ink-muted hover:text-ink disabled:opacity-50"
            >
              back to {job.defaultModel}
            </button>
          </div>
        ) : (
          <span className="text-ink-faint">on its default</span>
        )}
        {job.note ? <div className="mt-1 text-ink-faint">{job.note}</div> : null}
      </td>
    </tr>
  );
}

export function ModelsTab() {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ["job-settings"], queryFn: fetchJobSettings });
  const listeners = useQuery({
    queryKey: ["job-listeners"],
    queryFn: fetchListeners,
    refetchInterval: 15_000,
  });
  const [failure, setFailure] = useState<string | null>(null);

  const change = useMutation({
    mutationFn: ({ jobId, model }: { jobId: string; model: string }) =>
      setJobModel(jobId, model),
    onSuccess: () => {
      setFailure(null);
      void queryClient.invalidateQueries({ queryKey: ["job-settings"] });
    },
    onError: (error: Error) => setFailure(error.message),
  });

  const reset = useMutation({
    mutationFn: (jobId: string) => resetJobModel(jobId),
    onSuccess: () => {
      setFailure(null);
      void queryClient.invalidateQueries({ queryKey: ["job-settings"] });
    },
    onError: (error: Error) => setFailure(error.message),
  });

  const byApp = useMemo(() => {
    const groups = new Map<string, JobSetting[]>();
    for (const job of settings.data?.jobs ?? []) {
      const existing = groups.get(job.app);
      if (existing) existing.push(job);
      else groups.set(job.app, [job]);
    }
    return [...groups.entries()];
  }, [settings.data]);

  if (settings.isPending)
    return <p className="p-4 text-[12px] text-ink-faint">Loading the model table…</p>;
  if (settings.isError)
    return <p className="p-4 text-[12px] text-bad">Could not load the model table.</p>;

  const busy = change.isPending || reset.isPending;

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-[80ch] text-[12px] leading-relaxed text-ink-muted">
        Each app reads this table when it starts and refreshes it about once a
        minute, so a change here reaches a running pipeline without a restart.
        If this dashboard is unreachable the apps keep running on whatever they
        last read, and a fresh process falls back to the models checked into the
        gateway.
      </p>

      {failure ? (
        <p className="rounded border border-bad/40 bg-surface px-3 py-2 text-[12px] text-bad">
          {failure}
        </p>
      ) : null}

      {byApp.map(([app, jobs]) => (
        <Panel
          key={app}
          title={app}
          note={noteFor(jobs)}
        >
          <ListenerBanner
            status={listeners.data?.apps.find((entry) => entry.app === app)}
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className="text-[10px] uppercase tracking-[0.12em] text-ink-faint">
                  <th className="px-3 py-1.5 font-medium">Job</th>
                  <th className="w-[240px] px-3 py-1.5 font-medium">Model</th>
                  <th className="w-[260px] px-3 py-1.5 font-medium">State</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <JobRow
                    key={job.id}
                    job={job}
                    offered={settings.data.offeredModels}
                    busy={busy}
                    pinnedTo={
                      listeners.data?.apps.find((entry) => entry.app === app)
                        ?.pinnedJobs?.[job.id]
                    }
                    onChange={(model) => change.mutate({ jobId: job.id, model })}
                    onReset={() => reset.mutate(job.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ))}
    </div>
  );
}
