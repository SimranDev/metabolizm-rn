/**
 * Guards the daily_summaries two-writer invariant.
 *
 * recomputeDay owns every nutrition column; recomputeDayWeight owns weight_kg.
 * They share a primary key, so the only thing keeping them from clobbering
 * each other is that their ON CONFLICT ... DO UPDATE SET maps are disjoint.
 * Nothing in the type system says so, and the two upserts look near-identical
 * side by side — this is exactly the pair someone tidies into one helper.
 *
 * Asserted against the generated SQL, so no database is involved: postgres-js
 * connects lazily, and building a query never opens a socket (the same trick
 * groups/masking.test.ts uses).
 */
import * as schema from "@metabolizm/db";
import { dailySummaries } from "@metabolizm/db";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { describe, expect, it } from "vitest";

const db = drizzle(postgres("postgres://user:pw@127.0.0.1:5432/unused"), {
  schema,
});

/** The `SET ...` clause of an upsert, lowercased. */
function updateClause(sql: string): string {
  const marker = "do update set ";
  const at = sql.toLowerCase().indexOf(marker);
  expect(at).toBeGreaterThan(-1);
  return sql.slice(at + marker.length).toLowerCase();
}

const NUTRITION_COLUMNS = [
  "energy_kcal",
  "protein_g",
  "carbs_g",
  "fat_g",
  "meals_logged",
  "meal_names",
  "target_kcal",
  "target_protein_g",
  "target_carbs_g",
  "target_fat_g",
];

describe("daily_summaries writers stay disjoint", () => {
  // Mirrors the `snapshot` object in recomputeDay.
  const nutritionSet = {
    energyKcal: 0,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    mealsLogged: 0,
    mealNames: [],
    targetKcal: null,
    targetProteinG: null,
    targetCarbsG: null,
    targetFatG: null,
    updatedAt: new Date(),
  };

  it("the diary recompute never writes weight_kg", () => {
    const { sql } = db
      .insert(dailySummaries)
      .values({ userId: "u", entryDate: "2026-07-20", ...nutritionSet })
      .onConflictDoUpdate({
        target: [dailySummaries.userId, dailySummaries.entryDate],
        set: nutritionSet,
      })
      .toSQL();

    expect(updateClause(sql)).not.toContain("weight_kg");
  });

  it("the weight recompute writes weight_kg and nothing else", () => {
    const { sql } = db
      .insert(dailySummaries)
      .values({ userId: "u", entryDate: "2026-07-20", weightKg: 72.1 })
      .onConflictDoUpdate({
        target: [dailySummaries.userId, dailySummaries.entryDate],
        set: { weightKg: 72.1, updatedAt: new Date() },
      })
      .toSQL();

    const clause = updateClause(sql);
    expect(clause).toContain("weight_kg");
    expect(clause).toContain("updated_at");
    for (const column of NUTRITION_COLUMNS) {
      expect(clause).not.toContain(column);
    }
  });

  it("a weight-only insert leaves nutrition to the column defaults", () => {
    // Logging a weight on a day with no food creates the summary row. Drizzle
    // emits every nutrition column as the literal DEFAULT rather than a value
    // from application code, so the row's zeros come from the schema. If any
    // of those columns ever loses its NOT NULL DEFAULT, this insert starts
    // failing and a weigh-in on a foodless day 500s.
    const { sql, params } = db
      .insert(dailySummaries)
      .values({ userId: "u", entryDate: "2026-07-20", weightKg: 72.1 })
      .toSQL();

    // Only the three columns actually supplied are bound.
    expect(params).toEqual(["u", "2026-07-20", "72.1"]);

    const values = sql.toLowerCase().slice(sql.toLowerCase().indexOf("values"));
    const defaults = values.match(/default/g) ?? [];
    expect(defaults).toHaveLength(NUTRITION_COLUMNS.length + 1); // + updated_at
  });
});
