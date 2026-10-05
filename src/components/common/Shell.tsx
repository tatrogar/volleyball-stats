import type { ReactNode } from "react";
import { navigate } from "../../lib/router";

const TABS = [
  { path: "/", label: "Home" },
  { path: "/settings", label: "Settings" },
  { path: "/backup", label: "Backup" },
];

export function Shell({ route, children }: { route: string; children: ReactNode }) {
  const active = (path: string) => (path === "/" ? route === "/" : route.startsWith(path) || (path === "/settings" && route.startsWith("/teams")));
  return (
    <div className="min-h-full flex flex-col">
      <header className="bg-blue-900 text-white" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="flex items-center gap-2 px-4 h-16">
          <span className="text-xl font-bold mr-4">Volleyball Stats</span>
          <nav className="flex gap-1">
            {TABS.map((t) => (
              <button
                key={t.path}
                onClick={() => navigate(t.path)}
                className={`btn text-lg ${active(t.path) ? "bg-white/20" : "text-blue-100 active:bg-white/10"}`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main className="flex-1 w-full max-w-6xl mx-auto p-4 md:p-6">{children}</main>
    </div>
  );
}

export function PageTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
      <h1 className="text-2xl font-bold">{children}</h1>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}
