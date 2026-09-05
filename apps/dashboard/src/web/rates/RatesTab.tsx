import { useQuery } from "@tanstack/react-query";
import { fetchRates } from "../lib/api";
import { Panel } from "../components/primitives";

/**
 * What we are charged, and the evidence for it.
 *
 * Every other view here answers "what did we spend". This one answers "on what
 * basis" -- which is the question stored events cannot answer, because the cost
 * on an event was computed at ingest and the rate that produced it is not kept
 * beside it.
 *
 * Each row carries the date it was checked and a link to the page it was
 * checked against, so a rate can be re-verified in one click rather than
 * trusted because somebody wrote it down.
 */

function money(value: number | undefined) {
  if (value === undefined) return "—";
  return `$${value.toFixed(3)}`;
}

function staleness(verifiedOn: string) {
  const days = Math.floor((Date.now() - Date.parse(verifiedOn)) / 86_400_000);
  if (!Number.isFinite(days)) return null;
  if (days <= 60) return <span className="text-ink-faint">{days}d ago</span>;
  // Said plainly rather than coloured red: an old rate is not wrong, it is
  // unchecked, and those are different claims.
  return <span className="text-amber-600">{days}d ago — recheck</span>;
}

export function RatesTab() {
  const rates = useQuery({ queryKey: ["rates"], queryFn: fetchRates });

  if (rates.isPending) return <p className="p-4 text-[12px] text-ink-faint">Loading rates…</p>;
  if (rates.isError)
    return <p className="p-4 text-[12px] text-rose-600">Could not load the rate card.</p>;

  const { models, unpriceable, appliedBy } = rates.data;
  const live = models.filter((rate) => rate.inUse);
  const retired = models.filter((rate) => !rate.inUse);

  const table = (rows: typeof models) => (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead className="text-left text-[11px] uppercase tracking-[0.1em] text-ink-faint">
          <tr className="border-b border-line-soft">
            <th className="px-3 py-2 font-medium">Model</th>
            <th className="px-3 py-2 font-medium">Input / 1M</th>
            <th className="px-3 py-2 font-medium">Output / 1M</th>
            <th className="px-3 py-2 font-medium">Cached / 1M</th>
            <th className="px-3 py-2 font-medium">Above 200k in / out</th>
            <th className="px-3 py-2 font-medium">Verified</th>
            <th className="px-3 py-2 font-medium">Source</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((rate) => (
            <tr key={rate.model} className="border-b border-line-soft/60 last:border-0">
              <td className="px-3 py-2 font-medium text-ink">
                {rate.model}
                {rate.note ? <div className="text-[11px] text-amber-600">{rate.note}</div> : null}
              </td>
              <td className="px-3 py-2 tabular-nums">{money(rate.input)}</td>
              <td className="px-3 py-2 tabular-nums">{money(rate.output)}</td>
              <td className="px-3 py-2 tabular-nums">{money(rate.cachedInput)}</td>
              <td className="px-3 py-2 tabular-nums text-ink-muted">
                {rate.largeInput !== undefined
                  ? `${money(rate.largeInput)} / ${money(rate.largeOutput)}`
                  : "—"}
              </td>
              <td className="px-3 py-2">
                <div className="tabular-nums">{rate.verifiedOn}</div>
                <div className="text-[11px]">{staleness(rate.verifiedOn)}</div>
              </td>
              <td className="px-3 py-2">
                <a
                  className="text-sky-600 underline decoration-dotted underline-offset-2"
                  href={rate.source}
                  target="_blank"
                  rel="noreferrer"
                >
                  check
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4 p-4">
      <Panel
        title="Rates in use"
        note={`${live.length} model${live.length === 1 ? "" : "s"} · applied by ${appliedBy}`}
      >
        {table(live)}
      </Panel>

      <Panel
        title="Retired rates"
        note="Nothing calls these. Kept so stored runs stay priced as they were charged."
      >
        {table(retired)}
      </Panel>

      <Panel title="Billed per call, not per token" note="These can never show a cost here">
        <ul className="flex flex-col gap-2 p-3 text-[12px]">
          {unpriceable.map((entry) => (
            <li key={entry.provider}>
              <span className="font-medium text-ink">{entry.provider}</span>
              <span className="text-ink-muted"> — {entry.reason}</span>
              {entry.source ? (
                <>
                  {" "}
                  <a
                    className="text-sky-600 underline decoration-dotted underline-offset-2"
                    href={entry.source}
                    target="_blank"
                    rel="noreferrer"
                  >
                    pricing
                  </a>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
