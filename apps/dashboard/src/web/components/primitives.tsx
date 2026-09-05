import type { ReactNode } from "react";

/**
 * The small set of shapes both tabs are built from.
 *
 * Kept in one file because they are one-screen components with no state; a
 * folder of six three-line files would be harder to read than this.
 */

export function Panel({
  title,
  actions,
  children,
  note,
}: {
  title: string;
  actions?: ReactNode;
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-md border border-line bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft px-3 py-2">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
            {title}
          </h2>
          {note ? <span className="text-[11px] text-ink-faint">{note}</span> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}

export function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "ok" | "warn" | "bad";
}) {
  const valueTone = {
    neutral: "text-ink",
    ok: "text-ok",
    warn: "text-warn",
    bad: "text-bad",
  }[tone];

  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-[0.12em] text-ink-faint">{label}</div>
      <div className={`numeric mt-1 text-2xl leading-none ${valueTone}`}>{value}</div>
      <div className="mt-1 h-4 text-[11px] text-ink-faint">{hint ?? ""}</div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-[11px] uppercase tracking-[0.1em] text-ink-faint">{label}</span>
      {children}
    </label>
  );
}

const CONTROL_CLASS =
  "rounded border border-line bg-surface-raised px-2 py-1 text-[12px] text-ink " +
  "outline-none focus:border-accent";

export function Select({
  value,
  onChange,
  options,
  anyLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
  /** When given, an "any" entry is prepended whose value is the empty string. */
  anyLabel?: string;
}) {
  return (
    <select className={CONTROL_CLASS} value={value} onChange={(e) => onChange(e.target.value)}>
      {anyLabel ? <option value="">{anyLabel}</option> : null}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex overflow-hidden rounded border border-line">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={
              "px-2 py-1 text-[11px] uppercase tracking-[0.08em] transition-colors " +
              (selected
                ? "bg-accent-soft text-ink"
                : "bg-surface-raised text-ink-faint hover:text-ink-muted")
            }
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function StatusBadge({ status }: { status: "ok" | "error" }) {
  return status === "ok" ? (
    <span className="rounded-sm bg-ok/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-ok">
      ok
    </span>
  ) : (
    <span className="rounded-sm bg-bad/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-bad">
      error
    </span>
  );
}

export function Dot({ tone }: { tone: "ok" | "warn" | "bad" | "idle" }) {
  const color = { ok: "bg-ok", warn: "bg-warn", bad: "bg-bad", idle: "bg-idle" }[tone];
  return <span className={`inline-block size-2 rounded-full ${color}`} />;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-3 py-8 text-center text-[12px] text-ink-faint">{children}</div>;
}

export function Loading() {
  return <div className="px-3 py-8 text-center text-[12px] text-ink-faint">Loading…</div>;
}

export function ErrorNote({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="m-3 rounded border border-bad/40 bg-bad/10 px-3 py-2 text-[12px] text-bad">
      {message}
    </div>
  );
}
