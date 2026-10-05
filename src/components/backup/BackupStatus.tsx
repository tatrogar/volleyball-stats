import { backupIsStale, daysSince } from "../../db/backup";
import { navigate } from "../../lib/router";
import { useApp } from "../../state/store";

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function BackupStatus() {
  const { meta, settings, teams } = useApp();
  const days = daysSince(meta.lastBackupAt);
  const stale = backupIsStale(meta.lastBackupAt, settings.backupReminderDays);
  const hasData = teams.length > 0;

  const text =
    meta.lastBackupAt == null
      ? "Never backed up"
      : `Last backup ${formatDate(meta.lastBackupAt)}${days != null && days > 0 ? ` (${days} day${days === 1 ? "" : "s"} ago)` : ""}`;

  if (stale && hasData)
    return (
      <div className="rounded-2xl bg-amber-50 border border-amber-300 p-4 flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <p className="font-bold text-amber-900">{text}</p>
          <p className="text-sm text-amber-900">
            If this app is removed from the home screen or Safari's website data is cleared, everything here is lost.
            A backup file in Files is the only copy.
          </p>
        </div>
        <button className="btn-primary" onClick={() => navigate("/backup")}>
          Back up now
        </button>
      </div>
    );
  return (
    <div className="flex items-center justify-between gap-3 mb-4 text-slate-600">
      <span>{text}</span>
      <button className="btn-ghost" onClick={() => navigate("/backup")}>
        Backup & restore
      </button>
    </div>
  );
}
