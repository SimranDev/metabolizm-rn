/**
 * Bulk-import USDA FoodData Central "Foundation Foods" / "SR Legacy" JSON
 * downloads (https://fdc.nal.usda.gov/download-datasets/) into the system
 * food catalog. Idempotent: re-runs update existing rows matched on
 * foods.source_ref ("fdc:<fdcId>").
 *
 * Usage (cwd is apps/admin; files typically in apps/admin/data/, gitignored):
 *   pnpm --filter admin import:usda data/FoodData_Central_foundation_food_json_2026-04-30.json
 *
 * The SR Legacy file is ~211 MB and is JSON.parsed whole in memory
 * (deliberately no streaming-parser dependency) — raise the heap for it:
 *   NODE_OPTIONS=--max-old-space-size=4096 pnpm --filter admin import:usda data/FoodData_Central_sr_legacy_food_json_2018-04.json
 */
import "dotenv/config";
import { readFileSync } from "node:fs";

import { foodPortions, foods } from "@metabolizm/db";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import { createDb, type Database } from "../server/db";
import { loadEnv } from "../server/env";
import { mapUsdaFood, type UsdaMapResult } from "../server/usda-mapper";

type MappedFood = Extract<UsdaMapResult, { ok: true }>;

const CHUNK_SIZE = 500;
const PORTION_INSERT_BATCH = 1000;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function detectDataset(doc: unknown): { name: string; items: unknown[] } {
  if (doc !== null && typeof doc === "object") {
    const record = doc as Record<string, unknown>;
    if (Array.isArray(record.FoundationFoods)) {
      return { name: "Foundation Foods", items: record.FoundationFoods };
    }
    if (Array.isArray(record.SRLegacyFoods)) {
      return { name: "SR Legacy", items: record.SRLegacyFoods };
    }
  }
  console.error(
    'Unrecognized file: expected a top-level "FoundationFoods" or "SRLegacyFoods" array ' +
      "(Branded/Survey datasets are not supported).",
  );
  process.exit(1);
}

async function importFile(db: Database, path: string): Promise<void> {
  const start = Date.now();
  console.log(`\n=== ${path}`);

  let doc: unknown;
  try {
    doc = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    console.error(`Cannot read/parse ${path}: ${String(error)}`);
    process.exit(1);
  }
  const { name: dataset, items } = detectDataset(doc);
  console.log(`Dataset: ${dataset}, ${items.length} entries`);

  // Map phase.
  const mapped: MappedFood[] = [];
  const skipped = new Map<string, number>();
  const skipSamples = new Map<string, string[]>();
  const seenRefs = new Set<string>();
  const unmapped = new Map<number, { name: string; unitName: string; count: number }>();
  let warningCount = 0;

  const countSkip = (reason: string, detail?: string) => {
    skipped.set(reason, (skipped.get(reason) ?? 0) + 1);
    if (!detail) return;
    const samples = skipSamples.get(reason) ?? [];
    if (samples.length < 3) {
      samples.push(detail);
      skipSamples.set(reason, samples);
    }
  };

  for (let i = 0; i < items.length; i++) {
    const raw = items[i];
    items[i] = null; // let GC reclaim the parsed file as we go
    if (raw === null || raw === undefined) {
      countSkip("null_entry");
      continue;
    }
    const result = mapUsdaFood(raw);
    if (!result.ok) {
      countSkip(result.reason, result.detail);
      continue;
    }
    if (seenRefs.has(result.sourceRef)) {
      countSkip("duplicate_source_ref", result.sourceRef);
      continue;
    }
    seenRefs.add(result.sourceRef);
    warningCount += result.warnings.length;
    for (const u of result.unknownNutrients) {
      const entry = unmapped.get(u.id);
      if (entry) entry.count += 1;
      else unmapped.set(u.id, { name: u.name, unitName: u.unitName, count: 1 });
    }
    mapped.push(result);
  }

  // Upsert phase: chunked transactions, matched on active source_ref.
  let inserted = 0;
  let updated = 0;
  const chunks = chunk(mapped, CHUNK_SIZE);
  for (let c = 0; c < chunks.length; c++) {
    const batch = chunks[c];
    const refs = batch.map((m) => m.sourceRef);
    await db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: foods.id, sourceRef: foods.sourceRef })
        .from(foods)
        .where(and(inArray(foods.sourceRef, refs), isNull(foods.deletedAt)));
      const byRef = new Map(existing.map((r) => [r.sourceRef, r.id]));

      const inserts = batch.filter((m) => !byRef.has(m.sourceRef));
      const updates = batch.filter((m) => byRef.has(m.sourceRef));

      const portionRows: (typeof foodPortions.$inferInsert)[] = [];

      if (inserts.length > 0) {
        const foodRows = inserts.map((m) => {
          const id = uuidv7();
          portionRows.push(
            ...m.input.portions.map((p) => ({
              id: uuidv7(),
              foodId: id,
              label: p.label,
              quantity: p.quantity,
              amountInBase: p.amountInBase,
              isDefault: p.isDefault,
            })),
          );
          return {
            id,
            ownerId: null,
            name: m.input.name,
            brand: null,
            description: m.input.description ?? null,
            barcode: null,
            sourceRef: m.sourceRef,
            source: "system" as const,
            baseUnit: "g" as const,
            servingSize: 100,
            servingLabel: null,
            energyKcal: m.input.energyKcal,
            proteinG: m.input.proteinG,
            carbsG: m.input.carbsG,
            fatG: m.input.fatG,
            nutrients: m.input.nutrients,
            visibility: "public" as const,
            isVerified: true,
            popularity: m.popularity,
          };
        });
        await tx.insert(foods).values(foodRows);
        inserted += inserts.length;
      }

      if (updates.length > 0) {
        // Mirrors the admin PATCH semantics: set all mapped fields, bump
        // version, replace portions wholesale. popularity is deliberately
        // NOT set here — it's only seeded on insert, so the fire-and-forget
        // read bumps accrued in production survive a re-import.
        const updatedIds: string[] = [];
        for (const m of updates) {
          const id = byRef.get(m.sourceRef)!;
          updatedIds.push(id);
          await tx
            .update(foods)
            .set({
              name: m.input.name,
              brand: null,
              description: m.input.description ?? null,
              barcode: null,
              baseUnit: "g",
              servingSize: 100,
              servingLabel: null,
              energyKcal: m.input.energyKcal,
              proteinG: m.input.proteinG,
              carbsG: m.input.carbsG,
              fatG: m.input.fatG,
              nutrients: m.input.nutrients,
              source: "system",
              visibility: "public",
              isVerified: true,
              sourceRef: m.sourceRef,
              version: sql`${foods.version} + 1`,
              updatedAt: new Date(),
            })
            .where(eq(foods.id, id));
          portionRows.push(
            ...m.input.portions.map((p) => ({
              id: uuidv7(),
              foodId: id,
              label: p.label,
              quantity: p.quantity,
              amountInBase: p.amountInBase,
              isDefault: p.isDefault,
            })),
          );
        }
        await tx
          .delete(foodPortions)
          .where(inArray(foodPortions.foodId, updatedIds));
        updated += updates.length;
      }

      for (const rows of chunk(portionRows, PORTION_INSERT_BATCH)) {
        if (rows.length > 0) await tx.insert(foodPortions).values(rows);
      }
    });
    console.log(
      `chunk ${c + 1}/${chunks.length}: ${batch.length} foods (running total: ${inserted} inserted, ${updated} updated)`,
    );
  }

  // Summary.
  const seconds = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n--- ${dataset} summary`);
  console.log(`inserted: ${inserted}`);
  console.log(`updated:  ${updated}`);
  const totalSkipped = [...skipped.values()].reduce((a, b) => a + b, 0);
  console.log(`skipped:  ${totalSkipped}`);
  for (const [reason, count] of [...skipped.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${reason}: ${count}`);
  }
  if (skipSamples.size > 0) {
    console.log(`skip samples (up to 3 per reason):`);
    for (const [reason, samples] of skipSamples) {
      for (const s of samples) console.log(`  - ${reason}: ${s}`);
    }
  }
  console.log(`per-food warnings (dropped units etc.): ${warningCount}`);
  if (unmapped.size > 0) {
    const top = [...unmapped.entries()].sort((a, b) => b[1].count - a[1].count);
    console.log(`unmapped FDC nutrients (${unmapped.size} distinct; top 30):`);
    for (const [id, u] of top.slice(0, 30)) {
      console.log(`  ${String(id).padStart(6)}  ${u.name || "?"} (${u.unitName || "?"}): ${u.count}`);
    }
    if (top.length > 30) console.log(`  … and ${top.length - 30} more`);
  }
  console.log(`duration: ${seconds}s`);
}

async function main(): Promise<void> {
  const paths = process.argv.slice(2);
  if (paths.length === 0) {
    console.error(
      "Usage: pnpm --filter admin import:usda <path-to-fdc-json> [more paths...]",
    );
    process.exit(1);
  }
  const env = loadEnv();
  const db = createDb(env.DATABASE_URL);
  try {
    for (const path of paths) {
      await importFile(db, path);
    }
  } finally {
    await db.$client.end();
  }
}

void main();
