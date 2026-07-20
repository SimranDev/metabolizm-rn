/**
 * Runtime helpers for the Groups feature — labels, share-dimension metadata,
 * and the date/copy math the screens share. Pure types live in
 * `@metabolizm/shared`; this is the mobile-side display layer.
 */

import type {
  GroupCategory,
  GroupMemberDayCardDto,
  GroupShareConfig,
} from "@metabolizm/shared";

/** Display order for the category picker. */
export const GROUP_CATEGORIES = [
  "partner",
  "family",
  "friends",
  "trainer",
] as const satisfies readonly GroupCategory[];

export const CATEGORY_LABEL: Record<GroupCategory, string> = {
  partner: "Partner",
  family: "Family",
  friends: "Friends",
  trainer: "Trainer",
};

export const CATEGORY_BLURB: Record<GroupCategory, string> = {
  partner: "Two people, full picture: meals, macros, weight trend.",
  family: "Leads with meals — names and photos. Numbers stay private.",
  friends: "Adherence, streaks and macros. Meal detail stays private.",
  trainer: "Clients share compliance detail with the coach only.",
};

/**
 * Which lens a group opens on. Family leads with what everyone ate; the rest
 * lead with adherence and consistency.
 */
export const leadsWithMeals = (category: GroupCategory): boolean =>
  category === "family";

/**
 * The share toggles, in the order the consent screen and settings sheet show
 * them. `adherenceOnly` is first and separated: it overrides the numeric
 * toggles rather than sitting alongside them.
 */
export const SHARE_DIMENSIONS = [
  {
    key: "adherenceOnly",
    label: "Adherence only",
    hint: "Share hit / missed vs your targets — no absolute numbers.",
  },
  { key: "calories", label: "Calories", hint: "Daily total against your target." },
  { key: "macros", label: "Macros in grams", hint: "Protein, carbs and fat totals." },
  { key: "mealNames", label: "Meal names", hint: "What you ate, without amounts." },
  {
    key: "mealDetail",
    label: "Full meal detail",
    hint: "Portions and per-item nutrition.",
  },
  { key: "weightTrend", label: "Weight trend", hint: "Direction only, never a number." },
  { key: "streaks", label: "Logging streaks", hint: "Consecutive days logged." },
] as const satisfies readonly {
  key: keyof GroupShareConfig;
  label: string;
  hint: string;
}[];

export type ShareDimension = (typeof SHARE_DIMENSIONS)[number];

/** Short chips summarizing what a member shares, for the members list. */
export function shareSummary(config: GroupShareConfig): string[] {
  if (config.adherenceOnly) {
    const extra = [
      config.streaks ? "Streaks" : null,
      config.mealNames ? "Meal names" : null,
    ].filter((v): v is string => v !== null);
    return ["Adherence only", ...extra];
  }
  const chips = [
    config.calories ? "Calories" : null,
    config.macros ? "Macros" : null,
    config.mealNames ? "Meal names" : null,
    config.mealDetail ? "Full meals" : null,
    config.weightTrend ? "Weight" : null,
    config.streaks ? "Streaks" : null,
  ].filter((v): v is string => v !== null);
  return chips.length > 0 ? chips : ["Nothing shared"];
}

/**
 * Only the keys that actually changed. The server merges a patch onto the
 * stored config, so sending a full object would overwrite toggles the user
 * never touched (see groupSharePatchSchema in @metabolizm/shared).
 */
export function shareConfigDiff(
  before: GroupShareConfig,
  after: GroupShareConfig,
): Partial<GroupShareConfig> {
  const patch: Partial<GroupShareConfig> = {};
  for (const { key } of SHARE_DIMENSIONS) {
    if (before[key] !== after[key]) patch[key] = after[key];
  }
  return patch;
}

/** Local `YYYY-MM-DD`, matching the diary store's day key. */
export function localDateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(date: string, days: number): string {
  const t = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** "Mon", "Tue"… for a YYYY-MM-DD, using UTC so the key never shifts a day. */
export function weekdayLabel(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: "short",
    timeZone: "UTC",
  });
}

/** "Jul 13–19" for a leaderboard week. */
export function weekRangeLabel(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  };
  const from = new Date(`${start}T00:00:00Z`).toLocaleDateString(undefined, opts);
  const to = new Date(`${end}T00:00:00Z`).toLocaleDateString(undefined, {
    day: "numeric",
    timeZone: "UTC",
  });
  return `${from}–${to}`;
}

/**
 * How many days of a window have actually happened. Adherence counts unlogged
 * past days as misses but excludes days still to come, so a percentage early
 * in the week is out of the elapsed days — copy must say "logged 3 of 5 days",
 * never a bare percentage that looks like a bad week.
 */
export function elapsedDays(weekStart: string, weekEnd: string): number {
  const today = localDateKey();
  const last = today < weekEnd ? today : weekEnd;
  if (last < weekStart) return 0;
  const span =
    (Date.parse(`${last}T00:00:00Z`) - Date.parse(`${weekStart}T00:00:00Z`)) /
    86_400_000;
  return Math.min(7, Math.max(1, Math.round(span) + 1));
}

/**
 * The one-line summary under a member's name on a feed card — built only from
 * what they share, so it never hints at a withheld number.
 */
export function cardSubtitle(card: GroupMemberDayCardDto): string {
  if (!card.logged) return "No logs yet today";
  if (card.adherence) {
    const hit = [
      card.adherence.caloriesInRange,
      card.adherence.proteinHit,
      card.adherence.carbsInRange,
      card.adherence.fatInRange,
    ].filter((v) => v !== null);
    const met = hit.filter(Boolean).length;
    return hit.length > 0
      ? `${met} of ${hit.length} targets hit`
      : "Logged today";
  }
  if (card.mealsLogged !== undefined) {
    return `${card.mealsLogged} ${card.mealsLogged === 1 ? "meal" : "meals"} logged`;
  }
  return "Logged today";
}

/**
 * Invite links. The universal-link domain isn't claimed yet, so a shared link
 * is currently something the recipient pastes into "Join with an invite" —
 * `parseInviteToken` accepts either the full link or the bare code.
 */
const INVITE_HOST = "https://mtbz.app/g";

export const inviteLink = (token: string): string => `${INVITE_HOST}/${token}`;

/** Token out of a pasted link or code; null when it isn't a plausible token. */
export function parseInviteToken(input: string): string | null {
  const trimmed = input.trim();
  const candidate = trimmed.includes("/")
    ? (trimmed.split("/").pop() ?? "")
    : trimmed;
  const token = candidate.split(/[?#]/)[0];
  return /^[A-Za-z0-9_-]{8,64}$/.test(token) ? token : null;
}

/**
 * Reaction tokens. The API stores the value as text, so these are words rather
 * than emoji — the Kinetic system renders symbols, never emoji glyphs.
 */
export const REACTIONS = [
  { token: "strong", ios: "figure.strengthtraining.traditional", android: "fitness_center", label: "Strong" },
  { token: "fire", ios: "flame.fill", android: "local_fire_department", label: "On fire" },
  { token: "clap", ios: "hands.clap.fill", android: "sign_language", label: "Nice work" },
] as const;
