import type { StatusFilter } from "@client/features/admin/hooks/usePayloadSyncFilters";

interface PayloadSyncStatsProps {
  stats: {
    total: number;
    synced: number;
    ready: number;
    incomplete: number;
    needsResync: number;
    failed: number;
    unsupported: number;
  };
  statusFilter: StatusFilter;
  toggleStatusFilter: (nextFilter: StatusFilter) => void;
}

const statCards = [
  { key: "total", filter: "all", label: "Total", color: "muted" },
  { key: "synced", filter: "synced", label: "Synced", color: "emerald" },
  { key: "ready", filter: "ready", label: "Ready to Sync", color: "blue" },
  { key: "incomplete", filter: "incomplete", label: "Incomplete", color: "amber" },
  { key: "needsResync", filter: "needs_resync", label: "Needs Resync", color: "orange" },
  { key: "failed", filter: "failed", label: "Failed", color: "red" },
  { key: "unsupported", filter: "unsupported", label: "Unsupported", color: "muted" },
] as const;

const statClassByColor = {
  amber: {
    card: "bg-amber-500/10 border border-amber-500/20 p-4 rounded text-left transition hover:cursor-pointer hover:bg-amber-500/20",
    active: "ring-2 ring-amber-400/60",
    value: "text-2xl font-bold text-amber-400",
    label: "text-sm text-amber-400/80",
  },
  blue: {
    card: "bg-blue-500/10 border border-blue-500/20 p-4 rounded text-left transition hover:cursor-pointer hover:bg-blue-500/20",
    active: "ring-2 ring-blue-400/60",
    value: "text-2xl font-bold text-blue-400",
    label: "text-sm text-blue-400/80",
  },
  emerald: {
    card: "bg-emerald-500/10 border border-emerald-500/20 p-4 rounded text-left transition hover:cursor-pointer hover:bg-emerald-500/20",
    active: "ring-2 ring-emerald-400/60",
    value: "text-2xl font-bold text-emerald-400",
    label: "text-sm text-emerald-400/80",
  },
  muted: {
    card: "bg-muted/50 border border-border p-4 rounded text-left transition hover:cursor-pointer hover:bg-muted",
    active: "ring-2 ring-foreground/25",
    value: "text-2xl font-bold text-muted-foreground",
    label: "text-sm text-muted-foreground",
  },
  orange: {
    card: "bg-orange-500/10 border border-orange-500/20 p-4 rounded text-left transition hover:cursor-pointer hover:bg-orange-500/20",
    active: "ring-2 ring-orange-400/60",
    value: "text-2xl font-bold text-orange-400",
    label: "text-sm text-orange-400/80",
  },
  red: {
    card: "bg-red-500/10 border border-red-500/20 p-4 rounded text-left transition hover:cursor-pointer hover:bg-red-500/20",
    active: "ring-2 ring-red-400/60",
    value: "text-2xl font-bold text-red-400",
    label: "text-sm text-red-400/80",
  },
};

export function PayloadSyncStats({ stats, statusFilter, toggleStatusFilter }: PayloadSyncStatsProps) {
  return (
    <div className="grid grid-cols-2 xl:grid-cols-7 gap-4 mb-6">
      {statCards.map((card) => {
        const active = statusFilter === card.filter;
        const classes = statClassByColor[card.color];

        return (
          <button
            key={card.key}
            type="button"
            onClick={() => toggleStatusFilter(card.filter)}
            className={`${classes.card} ${active ? classes.active : ""}`}
            aria-pressed={active}
          >
            <div className={classes.value}>{stats[card.key]}</div>
            <div className={classes.label}>{card.label}</div>
          </button>
        );
      })}
    </div>
  );
}
