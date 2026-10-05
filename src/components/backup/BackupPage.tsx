import { useEffect, useRef, useState } from "react";
import { backupFileName, buildBackup, parseBackup, restoreBackup, serializeBackup, type BackupFile, type BackupSummary } from "../../db/backup";
import { saveFile } from "../../lib/share";
import { useApp } from "../../state/store";
import { Confirm } from "../common/Dialog";
import { Section } from "../common/Fields";
import { PageTitle } from "../common/Shell";
import { formatDate } from "./BackupStatus";

interface Prepared {
  text: string;
  fileName: string;
  bytes: number;
  counts: { teams: number; players: number; matches: number; events: number };
}

const fmtBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

export function BackupPage() {
  const { meta, persisted, markBackedUp, load } = useApp();
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<{ usage?: number; quota?: number } | null>(null);

  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ backup: BackupFile; summary: BackupSummary; fileName: string } | null>(null);
  const [restoring, setRestoring] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // The share sheet only opens straight from a tap, so the file is built ahead
  // of time rather than after the button is pressed.
  const prepare = async () => {
    const b = await buildBackup();
    const text = serializeBackup(b);
    setPrepared({
      text,
      fileName: backupFileName(b.exportedAt),
      bytes: new Blob([text]).size,
      counts: { teams: b.data.teams.length, players: b.data.players.length, matches: b.data.matches.length, events: b.data.events.length },
    });
  };

  useEffect(() => {
    void prepare();
    navigator.storage?.estimate?.().then(setEstimate, () => setEstimate(null));
  }, []);

  const backUp = async () => {
    if (!prepared) return;
    setMessage(null);
    const outcome = await saveFile(prepared.text, prepared.fileName, "application/json");
    if (outcome === "cancelled") {
      setMessage("Backup cancelled. Nothing was saved.");
      return;
    }
    await markBackedUp();
    setMessage(
      outcome === "shared"
        ? `Sent ${prepared.fileName}. If you chose “Save to Files”, it's in the folder you picked.`
        : `Downloaded ${prepared.fileName}. Look in Files → Downloads.`,
    );
  };

  const pickFile = async (file: File | undefined) => {
    setRestoreError(null);
    if (!file) return;
    const result = parseBackup(await file.text());
    if (!result.ok) setRestoreError(result.error);
    else setPending({ backup: result.backup, summary: result.summary, fileName: file.name });
    if (fileInput.current) fileInput.current.value = "";
  };

  const doRestore = async () => {
    if (!pending) return;
    setRestoring(true);
    try {
      await restoreBackup(pending.backup);
      await load();
      await prepare();
      setMessage(`Restored from ${pending.fileName}.`);
    } catch (err) {
      setRestoreError(`Restore failed and nothing was changed. ${err instanceof Error ? err.message : ""}`);
    } finally {
      setPending(null);
      setRestoring(false);
    }
  };

  return (
    <>
      <PageTitle>Backup & restore</PageTitle>

      {message && <div className="rounded-xl bg-green-50 border border-green-300 text-green-900 p-3 mb-4">{message}</div>}

      <Section title="Back up">
        <p className="text-slate-600 mb-1">
          Saves everything (teams, rosters, seasons, matches, stats and settings) as one file. Videos aren't included; they stay in your
          Files app.
        </p>
        <p className="text-slate-600 mb-4">
          Tap below, then choose <strong>Save to Files</strong>. Put it somewhere outside this app, like iCloud Drive or On My iPad.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <button className="btn-primary text-lg px-6" disabled={!prepared} onClick={backUp}>
            Back up now
          </button>
          {prepared && (
            <span className="text-slate-500">
              {prepared.counts.teams} teams · {prepared.counts.players} players · {prepared.counts.matches} matches · {prepared.counts.events} stats ·{" "}
              {fmtBytes(prepared.bytes)}
            </span>
          )}
        </div>
        <p className="mt-4 text-slate-600">
          Last backup: <strong>{meta.lastBackupAt ? formatDate(meta.lastBackupAt) : "never"}</strong>
        </p>
      </Section>

      <Section title="Restore">
        <p className="text-slate-600 mb-4">
          Replaces <strong>everything</strong> on this iPad with what's in a backup file. You'll see what's in the file and confirm before
          anything changes.
        </p>
        <input ref={fileInput} type="file" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
        <button className="btn-secondary" onClick={() => fileInput.current?.click()}>
          Choose a backup file…
        </button>
        {restoreError && <div className="mt-3 rounded-xl bg-red-50 border border-red-300 text-red-900 p-3">{restoreError}</div>}
      </Section>

      <Section title="Storage on this iPad">
        <ul className="text-slate-600 space-y-1">
          <li>
            Protected from automatic clean-up:{" "}
            <strong>{persisted === true ? "yes" : persisted === false ? "not yet" : "unknown"}</strong>
            {persisted !== true && " (Safari usually allows this once the app is added to the home screen)"}
          </li>
          {estimate?.usage != null && <li>Using about {fmtBytes(estimate.usage)}</li>}
        </ul>
        <p className="text-sm text-slate-500 mt-3">
          Safari keeps data for the home-screen app separate from data in a regular Safari tab. Moving from one to the other is a
          backup and restore.
        </p>
      </Section>

      <Confirm
        open={pending != null}
        title="Replace everything with this backup?"
        danger
        requireText="replace"
        confirmLabel={restoring ? "Restoring…" : "Replace and restore"}
        body={
          pending && (
            <>
              <p>
                <strong>{pending.fileName}</strong>, made {formatDate(pending.summary.exportedAt)}
              </p>
              <p>
                {pending.summary.counts.teams} team{pending.summary.counts.teams === 1 ? "" : "s"}
                {pending.summary.teamNames.length > 0 && ` (${pending.summary.teamNames.join(", ")})`}, {pending.summary.counts.players} players,{" "}
                {pending.summary.counts.seasons} seasons, {pending.summary.counts.matches} matches, {pending.summary.counts.events} stats.
              </p>
              {pending.summary.warnings.length > 0 && (
                <div className="rounded-xl bg-amber-50 border border-amber-300 text-amber-900 p-3 text-sm">
                  <p className="font-semibold">Some records don't line up. They'll be restored anyway:</p>
                  {pending.summary.warnings.map((w) => (
                    <p key={w}>• {w}</p>
                  ))}
                </div>
              )}
              <p className="font-semibold text-red-700">Everything currently on this iPad will be replaced. If in doubt, back up first.</p>
            </>
          )
        }
        onCancel={() => setPending(null)}
        onConfirm={doRestore}
      />
    </>
  );
}
