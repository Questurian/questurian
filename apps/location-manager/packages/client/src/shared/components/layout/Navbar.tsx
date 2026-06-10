import { Link, useLocation } from "react-router-dom";
import { MapPin, Plus, Settings, ArrowUpDown, Ticket, SlidersHorizontal } from "lucide-react";
import { usePendingTaxonomy } from "@client/shared/services/api/hooks";

export function Navbar() {
  const { data: pendingEntries } = usePendingTaxonomy();
  const pendingCount = pendingEntries?.length || 0;
  const location = useLocation();

  const navItems = [
    { to: "/add", label: "Add Location", shortLabel: "Add", icon: Plus },
    { to: "/tours", label: "Tours", shortLabel: "Tours", icon: Ticket },
    {
      to: "/admin/taxonomy",
      label: "Taxonomy",
      shortLabel: "Review",
      icon: Settings,
      badge: pendingCount,
    },
    { to: "/admin/payload-sync", label: "Payload Sync", shortLabel: "Sync", icon: ArrowUpDown },
    { to: "/admin/settings", label: "Settings", shortLabel: "Settings", icon: SlidersHorizontal },
  ];

  const isActive = (path: string) => {
    if (path === "/add") {
      return location.pathname === "/add" || location.pathname.startsWith("/add/");
    }
    return location.pathname === path;
  };

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm text-foreground">
      <div className="mx-auto max-w-7xl px-3 py-3 sm:px-6 sm:py-0">
        <div className="flex flex-col gap-3 sm:h-14 sm:flex-row sm:items-center sm:justify-between">
          <Link
            to="/"
            className="flex min-w-0 items-center gap-2 text-foreground transition-opacity hover:opacity-80 [color:inherit]"
          >
            <MapPin className="h-5 w-5 shrink-0" />
            <span className="truncate text-sm font-semibold leading-tight">Location Manager</span>
          </Link>

          <div className="grid w-full grid-cols-5 gap-2 sm:flex sm:w-auto sm:items-center sm:gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex min-w-0 items-center justify-center gap-1.5 rounded-md px-2.5 py-2 text-xs transition-colors sm:justify-start sm:px-3 sm:py-1.5 sm:text-sm [color:inherit] ${
                    active
                      ? "bg-accent text-foreground"
                      : "text-foreground hover:bg-accent/50 hover:opacity-80"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate sm:hidden">{item.shortLabel}</span>
                  <span className="hidden truncate sm:inline">{item.label}</span>
                  {item.badge != null && item.badge > 0 && (
                    <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
