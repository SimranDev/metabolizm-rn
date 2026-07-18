/**
 * Catalog-hygiene rules shared by scripts/cleanup-usda-names.ts (one-off
 * data fix for the live DB) and the USDA mapper (import time), so a fresh
 * seed and the cleaned DB agree on names and portion labels.
 */

/**
 * USDA suffix boilerplate, e.g. "Cheese, cheddar (Includes foods for USDA's
 * Food Distribution Program)". Tolerates the curly apostrophe variant.
 */
const NAME_BOILERPLATE =
  /\s*\(Includes foods for USDA['’]s Food Distribution Program\)/gi;

export function cleanFoodName(name: string): string {
  return name.replace(NAME_BOILERPLATE, "").replace(/\s{2,}/g, " ").trim();
}

// "NLEA serving" / "RACC" are US labeling-regulation jargon leaking out of
// FDC portionDescription texts. Observed shapes, in the order the rules
// below fire: leading ("1 NLEA serving (makes 1/2 cup prepared)"),
// parenthetical with a real remainder ("1 serving (1 NLEA serving - about
// 4 crackers)"), pure parenthetical ("1 tbsp (1 NLEA serving)", "0.33 cup
// (NLEA serving size)"), trailing ("2 links 1 NLEA serving"), and a bare
// trailing ", NLEA".
const JARGON = "(?:NLEA serving|RACC)";
const LEADING = new RegExp(`^1\\s+${JARGON}\\b`, "i");
const PAREN_WITH_REMAINDER = new RegExp(
  `\\((?:1\\s+)?${JARGON}\\s*[-–—]\\s*`,
  "gi",
);
const PAREN_ONLY = new RegExp(
  `\\s*\\(\\s*(?:1\\s+)?${JARGON}(?:\\s+size)?\\s*\\)`,
  "gi",
);
const TRAILING = new RegExp(`\\s*,?\\s*(?:1\\s+)?${JARGON}$`, "i");
const TRAILING_BARE = /\s*,\s*(?:NLEA|RACC)$/i;

export function cleanPortionLabel(label: string): string {
  const cleaned = label
    .replace(LEADING, "1 serving")
    .replace(PAREN_WITH_REMAINDER, "(")
    .replace(PAREN_ONLY, "")
    .replace(TRAILING, "")
    .replace(TRAILING_BARE, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned === "" ? "1 serving" : cleaned;
}

/**
 * FDC categories pruned from the system catalog by hand (2026-07): branded
 * restaurant/fast-food composites, culturally-narrow survey data, and
 * categories the app serves better elsewhere. The importer must keep
 * skipping them or a re-seed would resurrect the pruned rows.
 */
export const EXCLUDED_CATEGORIES: ReadonlySet<string> = new Set([
  "Restaurant Foods",
  "Fast Foods",
  "American Indian/Alaska Native Foods",
  "Baby Foods",
  "Breakfast Cereals",
]);

// An ALL-CAPS token of 4+ chars (allowing '&.- inside) marks a brand name
// in SR Legacy descriptions ("KRAFT", "OSCAR MAYER"); "USDA" (grade
// labels like "USDA choice") is the one legitimate exception.
const BRAND_TOKEN = /[A-Z][A-Z'&.-]{2,}[A-Z]/g;

export function hasBrandToken(name: string): boolean {
  for (const match of name.matchAll(BRAND_TOKEN)) {
    if (match[0] !== "USDA") return true;
  }
  return false;
}

/**
 * Search-ranking seed, mirroring the heuristic hand-applied to the live
 * catalog: whole/raw foods first, plain cooked preparations next, and a
 * per-comma penalty so simpler names beat qualifier-laden variants.
 * Negative results are fine.
 */
export function computePopularity(name: string): number {
  let popularity = 0;
  if (name.toLowerCase().includes(", raw")) popularity += 100;
  else if (/cooked|boiled|grilled|roasted/i.test(name)) popularity += 40;
  const commas = name.match(/,/g)?.length ?? 0;
  return popularity - 5 * commas;
}
