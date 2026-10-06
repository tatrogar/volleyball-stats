import { useEffect, useState } from "react";
import { backupFileName, buildBackup, serializeBackup } from "../../db/backup";
import { saveFile } from "../../lib/share";
import { flushLiveWrites } from "../../state/live";
import { useApp } from "../../state/store";

/**
 * A Back up button that's ready to go. The share sheet only opens straight
 * from a tap, so the file is built as soon as this appears.
 */
export function BackupNow({ className, label = "Back up now" }: { className?: string; label?: string }) {
  const markBackedUp = useApp((s) => s.markBackedUp);
  const [file, setFile] = useState<{ text: string; name: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void flushLiveWrites()
      .then(buildBackup)
      .then((b) => alive && setFile({ text: serializeBackup(b), name: backupFileName(b.exportedAt) }));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div>
      <button
        className={className ?? "btn-primary"}
        disabled={!file}
        onClick={async () => {
          if (!file) return;
          const r = await saveFile(file.text, file.name, "application/json");
          if (r === "cancelled") return setMsg("Not saved.");
          await markBackedUp();
          setMsg(r === "shared" ? `Saved ${file.name}.` : `Downloaded ${file.name}.`);
        }}
      >
        {label}
      </button>
      {msg && <p className="text-sm text-slate-600 mt-2">{msg}</p>}
    </div>
  );
}
