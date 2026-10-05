import { useEffect } from "react";
import { BackupPage } from "./components/backup/BackupPage";
import { Shell } from "./components/common/Shell";
import { Home } from "./components/home/Home";
import { SettingsPage } from "./components/settings/SettingsPage";
import { TeamPage } from "./components/settings/TeamPage";
import { useRoute } from "./lib/router";
import { useApp } from "./state/store";

export default function App() {
  const route = useRoute();
  const { loaded, load } = useApp();
  useEffect(() => {
    load().catch((err) => {
      console.error(err);
      alert("The app's storage couldn't be opened. In Safari, check that Private Browsing is off.");
    });
  }, [load]);

  if (!loaded) return <div className="p-8 text-slate-500">Loading…</div>;

  const parts = route.split("/").filter(Boolean);
  let page;
  if (parts[0] === "teams" && parts[1]) page = <TeamPage teamId={parts[1]} />;
  else if (parts[0] === "settings") page = <SettingsPage tab={parts[1]} />;
  else if (parts[0] === "backup") page = <BackupPage />;
  else page = <Home />;

  return <Shell route={route}>{page}</Shell>;
}
