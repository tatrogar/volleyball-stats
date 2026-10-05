import { describeFormat, formatWarnings } from "../../lib/format";
import type { MatchFormat } from "../../types";
import { NumberField, Segmented, Toggle, Warnings } from "../common/Fields";

/** Used for a team's default format now, and for per-match overrides later. */
export function FormatEditor({ value, onChange }: { value: MatchFormat; onChange: (f: MatchFormat) => void }) {
  const set = (patch: Partial<MatchFormat>) => onChange({ ...value, ...patch });
  const fixed = value.setsMode === "fixed";

  return (
    <div className="space-y-5">
      <p className="text-slate-600">{describeFormat(value)}</p>

      <div>
        <span className="label">Sets</span>
        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            value={fixed ? "fixed" : `bestOf${value.setCount}`}
            options={[
              { value: "bestOf3", label: "Best of 3" },
              { value: "bestOf5", label: "Best of 5" },
              { value: "fixed", label: "Fixed number" },
            ]}
            onChange={(v) => {
              if (v === "fixed") set({ setsMode: "fixed", setCount: value.setCount });
              else set({ setsMode: "bestOf", setCount: v === "bestOf5" ? 5 : 3 });
            }}
          />
          {fixed && (
            <label className="flex items-center gap-2">
              <NumberField value={value.setCount} min={1} max={9} onChange={(n) => n != null && set({ setCount: n })} />
              <span>sets, all played whatever the result</span>
            </label>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-6">
        <label>
          <span className="label">Points per set</span>
          <NumberField value={value.pointsPerSet} min={1} max={99} onChange={(n) => n != null && set({ pointsPerSet: n })} />
        </label>
        <label>
          <span className="label">{fixed ? "Last-set points" : "Deciding-set points"}</span>
          <NumberField value={value.decidingSetPoints} min={1} max={99} onChange={(n) => n != null && set({ decidingSetPoints: n })} />
        </label>
        <label>
          <span className="label">Point cap (optional)</span>
          <NumberField value={value.pointCap} allowEmpty placeholder="None" max={99} onChange={(n) => set({ pointCap: n })} />
        </label>
        <label>
          <span className="label">Max subs per set (optional)</span>
          <NumberField value={value.maxSubsPerSet} allowEmpty placeholder="None" max={99} onChange={(n) => set({ maxSubsPerSet: n })} />
        </label>
      </div>

      <div className="max-w-xl divide-y">
        <Toggle checked={value.winBy2} onChange={(v) => set({ winBy2: v })} label="Win by 2" hint="A set isn't over until one side leads by two (or hits the cap)." />
        {fixed && (
          <Toggle
            checked={value.fixedLastSetIsDeciding}
            onChange={(v) => set({ fixedLastSetIsDeciding: v })}
            label="Play the last set to the shorter score"
            hint={`Last set goes to ${value.decidingSetPoints} instead of ${value.pointsPerSet}.`}
          />
        )}
      </div>

      <p className="text-sm text-slate-500">Rally scoring: every rally ends in a point.</p>
      <Warnings items={formatWarnings(value)} />
    </div>
  );
}
