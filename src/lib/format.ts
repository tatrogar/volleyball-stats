import type { MatchFormat } from "../types";

/** Plain-language summary, e.g. "Best of 3 · to 25, deciding set to 15 · win by 2". */
export function describeFormat(f: MatchFormat): string {
  const parts: string[] = [];
  if (f.setsMode === "bestOf") {
    parts.push(`Best of ${f.setCount}`);
    parts.push(`to ${f.pointsPerSet}, deciding set to ${f.decidingSetPoints}`);
  } else {
    parts.push(`${f.setCount} set${f.setCount === 1 ? "" : "s"}, all played`);
    parts.push(
      f.fixedLastSetIsDeciding
        ? `to ${f.pointsPerSet}, last set to ${f.decidingSetPoints}`
        : `to ${f.pointsPerSet}`,
    );
  }
  parts.push(f.winBy2 ? "win by 2" : "no win-by-2");
  if (f.pointCap != null) parts.push(`cap ${f.pointCap}`);
  if (f.maxSubsPerSet != null) parts.push(`${f.maxSubsPerSet} subs per set`);
  return parts.join(" · ");
}

/**
 * Things that look unusual. Rules vary by level, so these are shown as
 * warnings and never stop the user from saving.
 */
export function formatWarnings(f: MatchFormat): string[] {
  const w: string[] = [];
  if (!Number.isInteger(f.setCount) || f.setCount < 1) w.push("Number of sets should be a whole number of at least 1.");
  if (f.setsMode === "bestOf" && f.setCount % 2 === 0)
    w.push(`"Best of ${f.setCount}" can end tied. Best-of formats are usually 3 or 5.`);
  if (f.pointsPerSet < 1) w.push("Points per set should be at least 1.");
  if (f.decidingSetPoints < 1) w.push("Deciding-set points should be at least 1.");
  if (f.decidingSetPoints > f.pointsPerSet)
    w.push("The deciding set is usually shorter than the others, not longer.");
  if (f.pointCap != null) {
    if (f.pointCap < f.pointsPerSet)
      w.push(`A cap of ${f.pointCap} is below the ${f.pointsPerSet} points needed to win a set.`);
    if (!f.winBy2) w.push("A point cap only matters with win-by-2 on.");
  }
  if (f.maxSubsPerSet != null && f.maxSubsPerSet < 0) w.push("Sub limit can't be negative.");
  return w;
}
