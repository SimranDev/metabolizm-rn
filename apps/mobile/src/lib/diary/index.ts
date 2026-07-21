/**
 * Translation between the on-device diary shape and the server's row shape.
 *
 * The two differ deliberately:
 * - the client keeps a nested `macros` object and a `serving` string, the
 *   server keeps flat `proteinG` / `energyKcal` / `servingLabel` columns;
 * - `unit` is `{ label, grams }` on-device and a `unitLabel` /
 *   `unitAmountInBase` pair on the wire;
 * - `accent` never crosses the wire at all — it is pure UI, recomputed from the
 *   dominant macro on the way back in.
 *
 * Everything here is the CONSUMED amount for the logged quantity. Per-100
 * figures belong to the catalog and must not reach these functions.
 */

import { dominantMacro } from "@/lib/food";
import type {
  DiaryEntry,
  DiaryEntryDto,
  DiaryEntryUpsert,
  MealId,
} from "@metabolizm/shared";

/** A local entry plus the day/meal it belongs to — what a push needs. */
export type PlacedEntry = {
  entry: DiaryEntry;
  entryDate: string;
  meal: MealId;
};

/** On-device entry → the upsert body. */
export function toUpsert({ entry, entryDate, meal }: PlacedEntry): DiaryEntryUpsert {
  return {
    id: entry.entryId,
    entryDate,
    meal,
    foodId: entry.foodId ?? null,
    name: entry.name,
    servingLabel: entry.serving,
    quantity: entry.quantity ?? null,
    unitLabel: entry.unit?.label ?? null,
    unitAmountInBase: entry.unit?.grams ?? null,
    energyKcal: entry.calories,
    proteinG: entry.macros.proteinG,
    carbsG: entry.macros.carbsG,
    fatG: entry.macros.fatG,
    nutrients: entry.nutrients ?? {},
    verified: entry.verified,
    loggedAt: entry.loggedAt,
  };
}

/** Server row → on-device entry, with `accent` recomputed. */
export function fromDto(dto: DiaryEntryDto): PlacedEntry {
  const entry: DiaryEntry = {
    entryId: dto.id,
    name: dto.name,
    serving: dto.servingLabel,
    calories: dto.energyKcal,
    macros: { proteinG: dto.proteinG, carbsG: dto.carbsG, fatG: dto.fatG },
    accent: dominantMacro(dto.proteinG, dto.carbsG, dto.fatG),
    verified: dto.verified,
    loggedAt: dto.loggedAt,
  };
  // Optional fields stay ABSENT rather than explicitly undefined, so a
  // round-tripped entry deep-equals one that never left the device.
  if (Object.keys(dto.nutrients).length > 0) entry.nutrients = dto.nutrients;
  if (dto.foodId !== null) entry.foodId = dto.foodId;
  if (dto.quantity !== null) entry.quantity = dto.quantity;
  if (dto.unitLabel !== null && dto.unitAmountInBase !== null) {
    entry.unit = { label: dto.unitLabel, grams: dto.unitAmountInBase };
  }
  return { entry, entryDate: dto.entryDate, meal: dto.meal };
}
