import { DashboardPage } from "@/features/dashboard/components/dashboard-page";
import { SettingsPage } from "@/features/settings/components/settings-page";
import { useSettingsStore } from "@/features/settings/store/use-settings-store";
import { navigate, useHashRoute } from "@/hooks/use-hash-route";

export function App() {
  const route = useHashRoute();
  const hasToken = useSettingsStore((s) => s.githubToken.length > 0);

  return (
    <div className="app-shell">
      <nav className="navbar">
        <button
          type="button"
          className={`nav-link ${route === "/" || route === "" ? "active" : ""}`}
          onClick={() => navigate("/")}
        >
          PRs
        </button>
        <button
          type="button"
          className={`nav-link ${route === "/settings" ? "active" : ""}`}
          onClick={() => navigate("/settings")}
        >
          Settings
          {!hasToken ? <span className="nav-badge">!</span> : null}
        </button>
      </nav>
      <main className="layout">{route === "/settings" ? <SettingsPage /> : <DashboardPage />}</main>
    </div>
  );
}
