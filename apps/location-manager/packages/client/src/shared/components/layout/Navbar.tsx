import { Link, useLocation } from "react-router-dom";
import { MapPin, Plus, Settings, ArrowUpDown } from "lucide-react";
import { usePendingTaxonomy } from "@client/shared/services/api/hooks";

export function Navbar() {
  const { data: pendingEntries } = usePendingTaxonomy();
  const pendingCount = pendingEntries?.length || 0;
  const location = useLocation();

  const navItems = [
    { to: "/add", label: "Add Location", icon: Plus },
    { to: "/admin/taxonomy", label: "Taxonomy", icon: Settings, badge: pendingCount },
    { to: "/admin/payload-sync", label: "Payload Sync", icon: ArrowUpDown },
  ];

  const isActive = (path: string) => {
    if (path === "/add") {
      return location.pathname === "/add" || location.pathname.startsWith("/add/");
    }
    return location.pathname === path;
  };

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm text-foreground">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 flex items-center justify-between h-14">
        <Link to="/" className="flex items-center gap-2 text-foreground hover:opacity-80 transition-opacity [color:inherit]">
          <MapPin className="h-5 w-5 shrink-0" />
          <span className="text-sm font-semibold">Location Manager</span>
        </Link>
        <div className="flex items-center gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors [color:inherit] ${
                  active
                    ? "bg-accent text-foreground"
                    : "text-foreground hover:opacity-80 hover:bg-accent/50"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
                {item.badge != null && item.badge > 0 && (
                  <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-bold leading-none text-white bg-destructive rounded-full">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
