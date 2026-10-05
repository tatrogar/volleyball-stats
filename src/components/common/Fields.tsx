import { useEffect, useState, type ReactNode } from "react";

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between gap-4 w-full text-left min-h-touch py-2"
      role="switch"
      aria-checked={checked}
    >
      <span>
        <span className="font-medium">{label}</span>
        {hint && <span className="block text-sm text-slate-500">{hint}</span>}
      </span>
      <span className={`relative shrink-0 w-14 h-8 rounded-full transition-colors ${checked ? "bg-blue-700" : "bg-slate-300"}`}>
        <span className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-all ${checked ? "left-7" : "left-1"}`} />
      </span>
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex flex-wrap rounded-xl border border-slate-300 bg-white p-1 gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`btn min-h-[44px] ${value === o.value ? "bg-blue-700 text-white" : "text-slate-700 active:bg-slate-100"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * A number box that lets the user clear it while typing and only reports a
 * value once it parses. Empty reports null when allowEmpty is set.
 */
export function NumberField({
  value,
  onChange,
  min,
  max,
  allowEmpty,
  placeholder,
  className,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  allowEmpty?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [text, setText] = useState(value == null ? "" : String(value));
  useEffect(() => setText(value == null ? "" : String(value)), [value]);
  return (
    <input
      className={`field w-28 ${className ?? ""}`}
      inputMode="numeric"
      pattern="[0-9]*"
      value={text}
      placeholder={placeholder}
      onChange={(e) => {
        const t = e.target.value.replace(/[^0-9]/g, "");
        setText(t);
        if (t === "") {
          if (allowEmpty) onChange(null);
          return;
        }
        let n = parseInt(t, 10);
        if (max != null) n = Math.min(n, max);
        onChange(n);
      }}
      onBlur={() => {
        if (text === "" && !allowEmpty) setText(value == null ? "" : String(value));
        if (text !== "" && min != null && parseInt(text, 10) < min) onChange(min);
      }}
    />
  );
}

/** A text input that saves on blur, so every keystroke isn't a database write. */
export function LazyText({
  value,
  onSave,
  className,
  placeholder,
  multiline,
}: {
  value: string;
  onSave: (v: string) => void;
  className?: string;
  placeholder?: string;
  multiline?: boolean;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => {
    if (text !== value) onSave(text);
  };
  if (multiline)
    return (
      <textarea
        className={`field py-2 min-h-[96px] ${className ?? ""}`}
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
      />
    );
  return (
    <input
      className={`field ${className ?? ""}`}
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}

export function Warnings({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-xl bg-amber-50 border border-amber-300 text-amber-900 p-3 text-sm space-y-1">
      {items.map((w) => (
        <p key={w}>⚠ {w}</p>
      ))}
    </div>
  );
}

export function Section({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="card p-5 mb-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-lg font-bold">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}
