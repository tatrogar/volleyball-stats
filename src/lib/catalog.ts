import type {
  CustomStat,
  ErrorSubtype,
  Layout,
  MatchFormat,
  PointEffect,
  Settings,
  StatAction,
  StatButtonId,
  StatOutcome,
} from "../types";

export interface StatButton {
  id: StatButtonId;
  label: string;
  /** Group shown in settings and help. */
  group: string;
  action: StatAction;
  outcome: StatOutcome;
  effect: PointEffect;
  /** Asks for an error subtype when tapped. */
  needsSubtype: boolean;
  /** Logged against the opponent rather than one of our players. */
  opponent?: boolean;
  help: string;
}

export const STAT_BUTTONS: StatButton[] = [
  // Serving
  {
    id: "serve",
    label: "Serve in",
    group: "Serving",
    action: "serve",
    outcome: "attempt",
    effect: "neutral",
    needsSubtype: false,
    help: "A serve that goes over and stays in play. Counts as a serve attempt.",
  },
  {
    id: "serve_ace",
    label: "Ace",
    group: "Serving",
    action: "serve",
    outcome: "ace",
    effect: "point_us",
    needsSubtype: false,
    help: "A serve that scores directly: it lands untouched, or the other team can't keep it in play.",
  },
  {
    id: "serve_error",
    label: "Serve error",
    group: "Serving",
    action: "serve",
    outcome: "error",
    effect: "point_them",
    needsSubtype: true,
    help: "A missed serve: into the net, out, or a foot fault. The other team gets the point.",
  },
  // Passing
  {
    id: "pass",
    label: "Pass",
    group: "Serve receive",
    action: "pass",
    outcome: "attempt",
    effect: "neutral",
    needsSubtype: false,
    help:
      "The first touch on the other team's serve. Rated 0–3 if rating is on: 3 = perfect, setter has every option; 2 = good, some options; 1 = poor, limited options.",
  },
  {
    id: "pass_error",
    label: "Reception error",
    group: "Serve receive",
    action: "pass",
    outcome: "error",
    effect: "point_them",
    needsSubtype: false,
    help: "A pass that loses the point: the player is aced, or overpasses and it costs us the rally. Rated 0.",
  },
  // Setting
  {
    id: "set",
    label: "Set",
    group: "Setting",
    action: "set",
    outcome: "attempt",
    effect: "neutral",
    needsSubtype: false,
    help: "A set to a hitter that doesn't directly lead to a kill.",
  },
  {
    id: "set_assist",
    label: "Assist",
    group: "Setting",
    action: "set",
    outcome: "assist",
    effect: "neutral",
    needsSubtype: false,
    help: "A set (or other pass) to a hitter who then gets a kill.",
  },
  {
    id: "set_error",
    label: "Ball-handling error",
    group: "Setting",
    action: "set",
    outcome: "error",
    effect: "point_them",
    needsSubtype: true,
    help: "The referee calls the set illegal: a double contact or a lift/carry.",
  },
  // Attacking
  {
    id: "attack",
    label: "Attack",
    group: "Attacking",
    action: "attack",
    outcome: "attempt",
    effect: "neutral",
    needsSubtype: false,
    help: "A hit meant to score that the other team keeps in play.",
  },
  {
    id: "attack_kill",
    label: "Kill",
    group: "Attacking",
    action: "attack",
    outcome: "kill",
    effect: "point_us",
    needsSubtype: false,
    help: "An attack that scores: it lands, or the other team can't return it.",
  },
  {
    id: "attack_error",
    label: "Attack error",
    group: "Attacking",
    action: "attack",
    outcome: "error",
    effect: "point_them",
    needsSubtype: true,
    help: "An attack that loses the point: hit out, into the net, or blocked straight back down.",
  },
  // Blocking
  {
    id: "block_solo",
    label: "Solo block",
    group: "Blocking",
    action: "block",
    outcome: "solo",
    effect: "point_us",
    needsSubtype: false,
    help: "One player blocks the other team's attack straight down for a point.",
  },
  {
    id: "block_assist",
    label: "Block assist",
    group: "Blocking",
    action: "block",
    outcome: "assist",
    effect: "point_us",
    needsSubtype: false,
    help: "Two or three players block together for a point. Each one gets a block assist (half a block).",
  },
  {
    id: "block_error",
    label: "Block error",
    group: "Blocking",
    action: "block",
    outcome: "error",
    effect: "point_them",
    needsSubtype: true,
    help: "A blocking fault that loses the point, such as touching the net or reaching over.",
  },
  // Defense
  {
    id: "dig",
    label: "Dig",
    group: "Defense",
    action: "dig",
    outcome: "dig",
    effect: "neutral",
    needsSubtype: false,
    help: "Keeping the other team's attack off the floor so we can play it.",
  },
  {
    id: "dig_error",
    label: "Dig error",
    group: "Defense",
    action: "dig",
    outcome: "error",
    effect: "point_them",
    needsSubtype: false,
    help: "A playable attack the player touches but can't keep up.",
  },
  // Other errors
  {
    id: "our_error",
    label: "Our error",
    group: "Errors",
    action: "error",
    outcome: "error",
    effect: "point_them",
    needsSubtype: true,
    help: "Any other mistake by our team that gives away the point, like a net touch or four hits. Pick the type.",
  },
  {
    id: "opp_error",
    label: "Their error",
    group: "Errors",
    action: "opponent_error",
    outcome: "error",
    effect: "point_us",
    needsSubtype: true,
    opponent: true,
    help: "The other team gives us the point with a mistake. Pick the type. We don't track opponent stats beyond this.",
  },
];

const BY_ID = new Map(STAT_BUTTONS.map((b) => [b.id, b]));

export const CUSTOM_PREFIX = "custom:";

export function customButtonId(stat: CustomStat): StatButtonId {
  return CUSTOM_PREFIX + stat.id;
}

/** Resolves built-in and custom buttons. Returns null for unknown or removed ones. */
export function resolveButton(id: StatButtonId, customStats: CustomStat[]): StatButton | null {
  const builtIn = BY_ID.get(id);
  if (builtIn) return builtIn;
  if (!id.startsWith(CUSTOM_PREFIX)) return null;
  const stat = customStats.find((s) => customButtonId(s) === id);
  if (!stat) return null;
  return {
    id,
    label: stat.name,
    group: "Custom",
    action: "custom",
    outcome:
      stat.effect === "point_us" ? "point_won" : stat.effect === "point_them" ? "point_lost" : "neutral",
    effect: stat.effect,
    needsSubtype: false,
    help: stat.help || "A stat you added.",
  };
}

export const PRESET_LAYOUTS: Layout[] = [
  { id: "preset:points", name: "Points only", buttons: [], builtIn: true },
  {
    id: "preset:standard",
    name: "Standard",
    buttons: [
      "attack_kill",
      "attack_error",
      "serve_ace",
      "serve_error",
      "block_solo",
      "block_assist",
      "pass",
      "dig",
      "our_error",
      "opp_error",
    ],
    builtIn: true,
  },
  {
    id: "preset:detailed",
    name: "Detailed",
    buttons: STAT_BUTTONS.map((b) => b.id),
    builtIn: true,
  },
];

export function allLayouts(settings: Settings): Layout[] {
  return [...PRESET_LAYOUTS, ...settings.customLayouts];
}

export function findLayout(settings: Settings, id: string): Layout {
  return allLayouts(settings).find((l) => l.id === id) ?? PRESET_LAYOUTS[1];
}

const SUBTYPE_LABELS = [
  "Serve net",
  "Serve out",
  "Foot fault",
  "Attack out",
  "Attack net",
  "Attack blocked",
  "Net touch",
  "Over the net / reaching",
  "Center line",
  "Rotation / overlap",
  "Double contact",
  "Lift / carry",
  "Four hits",
  "Back-row attack",
  "Illegal block",
  "Reception error",
  "Other",
];

export function defaultErrorSubtypes(): ErrorSubtype[] {
  // Stable IDs, so the defaults match across devices and restores.
  return SUBTYPE_LABELS.map((label) => ({
    id: "st:" + label.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, ""),
    label,
  }));
}

export function defaultFormat(): MatchFormat {
  return {
    setsMode: "bestOf",
    setCount: 3,
    pointsPerSet: 25,
    decidingSetPoints: 15,
    fixedLastSetIsDeciding: false,
    winBy2: true,
    pointCap: null,
    maxSubsPerSet: null,
  };
}

export function defaultSettings(): Settings {
  return {
    entryOrder: "player_first",
    passRatingMode: "optional",
    errorSubtypes: defaultErrorSubtypes(),
    customStats: [],
    customLayouts: [],
    videoLeadInSeconds: 3,
    backupReminderDays: 7,
    promptForPointReason: true,
  };
}

export const DEFAULT_LIVE_LAYOUT_ID = "preset:standard";
export const DEFAULT_REVIEW_LAYOUT_ID = "preset:detailed";
