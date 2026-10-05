import { useEffect, useState, type ReactNode } from "react";

export function Modal({ open, onClose, children, wide }: { open: boolean; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className={`card p-6 w-full ${wide ? "max-w-2xl" : "max-w-md"} max-h-[90vh] overflow-auto`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        {children}
      </div>
    </div>
  );
}

export function Confirm({
  open,
  title,
  body,
  confirmLabel,
  danger,
  requireText,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  /** The user must type this to enable the button. For destructive actions. */
  requireText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");
  useEffect(() => setTyped(""), [open]);
  const ready = !requireText || typed.trim().toLowerCase() === requireText.toLowerCase();
  return (
    <Modal open={open} onClose={onCancel}>
      <h2 className="text-xl font-bold mb-3">{title}</h2>
      <div className="text-slate-700 space-y-2 mb-4">{body}</div>
      {requireText && (
        <label className="block mb-4">
          <span className="label">Type “{requireText}” to confirm</span>
          <input className="field" value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="off" autoCorrect="off" />
        </label>
      )}
      <div className="flex justify-end gap-2">
        <button className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button className={danger ? "btn-danger" : "btn-primary"} disabled={!ready} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
