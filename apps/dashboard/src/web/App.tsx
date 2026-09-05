import { useEffect, useState } from "react";
import { ServicesTab } from "./services/ServicesTab";
import { ModelsTab } from "./models/ModelsTab";
import { RatesTab } from "./rates/RatesTab";
import { UsageTab } from "./usage/UsageTab";

/**
 * The shell: what the terminal dashboard shows, plus the API monitor built on
 * top of it. A handful of tabs, no router -- the tab is the only navigation
 * state, and
 * it is kept in the URL hash so a reload and a bookmark both land where the
 * operator was.
 */

const TABS = [
  { id: "services", label: "Services" },
  { id: "usage", label: "API Usage" },
  { id: "models", label: "Models" },
  { id: "rates", label: "Rates" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function tabFromHash(): TabId {
  const hash = window.location.hash.replace(/^#\/?/, "");
  return TABS.some((tab) => tab.id === hash) ? (hash as TabId) : "services";
}

export function App() {
  const [tab, setTab] = useState<TabId>(tabFromHash);

  useEffect(() => {
    const onHashChange = () => setTab(tabFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const select = (next: TabId) => {
    window.location.hash = `/${next}`;
    setTab(next);
  };

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-10 border-b border-line bg-ground/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5">
          <div className="flex items-baseline gap-2">
            <span className="text-[13px] font-semibold tracking-[0.18em] text-ink">
              QUESTURIAN
            </span>
            <span className="text-[11px] uppercase tracking-[0.14em] text-ink-faint">
              dashboard
            </span>
          </div>

          <nav className="flex items-center gap-1">
            {TABS.map((entry) => {
              const selected = entry.id === tab;
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => select(entry.id)}
                  className={
                    "rounded px-2.5 py-1 text-[12px] transition-colors " +
                    (selected
                      ? "bg-surface-raised text-ink"
                      : "text-ink-faint hover:text-ink-muted")
                  }
                >
                  {entry.label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 py-4">
        {tab === "services" ? <ServicesTab /> : null}
        {tab === "usage" ? <UsageTab /> : null}
        {tab === "models" ? <ModelsTab /> : null}
        {tab === "rates" ? <RatesTab /> : null}
      </main>
    </div>
  );
}
