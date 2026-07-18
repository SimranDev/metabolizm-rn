import { foodPortions, foods } from "@metabolizm/db";
import type {
  FoodDto,
  FoodListItemDto,
  FoodPortionDto,
  FoodSearchResponse,
} from "@metabolizm/shared";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import postgres from "postgres";
import { uuidv7 } from "uuidv7";
import { z } from "zod";

import { DB, type Database } from "../db/db.module";
import type {
  CreateFoodInput,
  ListFoodsQuery,
  UpdateFoodInput,
} from "./catalog.schemas";

type FoodRow = typeof foods.$inferSelect;
type PortionRow = typeof foodPortions.$inferSelect;

// Last row's sort key; keyset pagination over the search ORDER BY.
const cursorSchema = z.object({
  own: z.union([z.literal(0), z.literal(1)]),
  pre: z.union([z.literal(0), z.literal(1)]),
  ver: z.union([z.literal(0), z.literal(1)]),
  pop: z.number().int(),
  name: z.string(),
  id: z.uuid(),
});

type CursorPayload = z.output<typeof cursorSchema>;

function encodeCursor(cursor: CursorPayload): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(raw: string): CursorPayload {
  try {
    return cursorSchema.parse(
      JSON.parse(Buffer.from(raw, "base64url").toString("utf8")),
    );
  } catch {
    throw new BadRequestException("Invalid cursor");
  }
}

/** Escape LIKE/ILIKE metacharacters; backslash is Postgres' default ESCAPE. */
function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// drizzle wraps driver errors (DrizzleQueryError with the PostgresError as
// its cause), so walk the cause chain instead of checking the top level.
function isPgError(error: unknown, code: string): boolean {
  let current: unknown = error;
  while (current instanceof Error) {
    if (current instanceof postgres.PostgresError) return current.code === code;
    current = current.cause;
  }
  return false;
}

function toPortionDto(row: PortionRow): FoodPortionDto {
  return {
    id: row.id,
    label: row.label,
    quantity: row.quantity,
    amountInBase: row.amountInBase,
    isDefault: row.isDefault,
  };
}

function toFoodDto(row: FoodRow, portions: PortionRow[]): FoodDto {
  return {
    id: row.id,
    ownerId: row.ownerId,
    name: row.name,
    brand: row.brand,
    description: row.description,
    barcode: row.barcode,
    sourceRef: row.sourceRef,
    source: row.source,
    baseUnit: row.baseUnit,
    servingSize: row.servingSize,
    servingLabel: row.servingLabel,
    energyKcal: row.energyKcal,
    proteinG: row.proteinG,
    carbsG: row.carbsG,
    fatG: row.fatG,
    nutrients: row.nutrients,
    visibility: row.visibility,
    isVerified: row.isVerified,
    popularity: row.popularity,
    forkedFrom: row.forkedFrom,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    portions: portions.map(toPortionDto),
  };
}

@Injectable()
export class CatalogService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async createFood(userId: string, input: CreateFoodInput): Promise<FoodDto> {
    const foodId = input.id ?? uuidv7();
    try {
      return await this.db.transaction(async (tx) => {
        const [food] = await tx
          .insert(foods)
          .values({
            id: foodId,
            ownerId: userId,
            name: input.name,
            brand: input.brand ?? null,
            description: input.description ?? null,
            barcode: input.barcode ?? null,
            baseUnit: input.baseUnit,
            servingSize: input.servingSize,
            servingLabel: input.servingLabel ?? null,
            energyKcal: input.energyKcal,
            proteinG: input.proteinG,
            carbsG: input.carbsG,
            fatG: input.fatG,
            nutrients: input.nutrients,
            visibility: input.visibility,
            // source, isVerified, popularity, version: DB defaults
          })
          .returning();
        const portions =
          input.portions.length === 0
            ? []
            : await tx
                .insert(foodPortions)
                .values(
                  input.portions.map((p) => ({
                    id: p.id ?? uuidv7(),
                    foodId,
                    label: p.label,
                    quantity: p.quantity,
                    amountInBase: p.amountInBase,
                    isDefault: p.isDefault,
                  })),
                )
                .returning();
        return toFoodDto(food, portions);
      });
    } catch (error) {
      if (isPgError(error, "23505")) {
        throw new ConflictException(
          "A food with this id or barcode already exists",
        );
      }
      if (isPgError(error, "23503")) {
        // TODO(auth): goes away once real auth guarantees the user exists.
        throw new UnauthorizedException("Unknown user");
      }
      throw error;
    }
  }

  async listFoods(
    userId: string | null,
    query: ListFoodsQuery,
  ): Promise<FoodSearchResponse> {
    // Anonymous callers only see system foods, so their rank is a constant.
    // Cast makes it an expression: a bare integer in ORDER BY is a column
    // position to Postgres (parens don't help — still a Const node).
    const ownRank = userId
      ? sql<number>`case when ${foods.ownerId} = ${userId} then 1 else 0 end`
      : sql<number>`0::int`;
    const verifiedRank = sql<number>`case when ${foods.isVerified} then 1 else 0 end`;
    // Prefix tier: a name starting with q outranks a mere substring match no
    // matter the popularity ("Apples, raw" above "Pineapple, raw" for
    // q=apple). Constant when q is absent, same cast rationale as ownRank.
    const prefixRank = query.q
      ? sql<number>`(lower(${foods.name}) like ${escapeLike(query.q.toLowerCase()) + "%"})::int`
      : sql<number>`0::int`;
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;

    const filters: SQL[] = [isNull(foods.deletedAt)];
    filters.push(
      userId
        ? or(eq(foods.ownerId, userId), isNull(foods.ownerId))!
        : isNull(foods.ownerId),
    );
    if (query.q) {
      // 1-3 chars prefix-match ("chi" while typing means "starts with chi"),
      // 4+ infix. Length judged on the raw trimmed q, before escaping grows
      // it. Both shapes use the GIN trigram index (prefix via its
      // anchor-padded trigrams).
      const escaped = escapeLike(query.q);
      filters.push(
        ilike(foods.name, query.q.length <= 3 ? `${escaped}%` : `%${escaped}%`),
      );
    }
    if (cursor) {
      // Mixed sort directions (DESC ×4, ASC ×2) rule out a tuple
      // comparison; expand the lexicographic "after" predicate instead.
      filters.push(sql`(
        ${ownRank} < ${cursor.own}
        or (${ownRank} = ${cursor.own} and (${prefixRank} < ${cursor.pre}
          or (${prefixRank} = ${cursor.pre} and (${verifiedRank} < ${cursor.ver}
            or (${verifiedRank} = ${cursor.ver} and (${foods.popularity} < ${cursor.pop}
              or (${foods.popularity} = ${cursor.pop} and (${foods.name} > ${cursor.name}
                or (${foods.name} = ${cursor.name} and ${foods.id} > ${cursor.id}::uuid)))))))))
      )`);
    }

    const rows = await this.db
      .select({
        id: foods.id,
        ownerId: foods.ownerId,
        name: foods.name,
        brand: foods.brand,
        source: foods.source,
        baseUnit: foods.baseUnit,
        servingSize: foods.servingSize,
        servingLabel: foods.servingLabel,
        energyKcal: foods.energyKcal,
        proteinG: foods.proteinG,
        carbsG: foods.carbsG,
        fatG: foods.fatG,
        isVerified: foods.isVerified,
        popularity: foods.popularity,
        // Selected (not recomputed in JS for the cursor) so Postgres lower()
        // and JS toLowerCase() can never disagree on the same row.
        pre: prefixRank.as("pre"),
        // nutrients jsonb deliberately excluded from list results
      })
      .from(foods)
      .where(and(...filters))
      .orderBy(
        desc(ownRank),
        desc(prefixRank),
        desc(foods.isVerified),
        desc(foods.popularity),
        asc(foods.name),
        asc(foods.id),
      )
      .limit(query.limit + 1); // +1 row to detect a next page

    const page = rows.slice(0, query.limit);
    const last = page[page.length - 1];
    const nextCursor =
      rows.length > query.limit && last
        ? encodeCursor({
            own: userId !== null && last.ownerId === userId ? 1 : 0,
            pre: last.pre ? 1 : 0,
            ver: last.isVerified ? 1 : 0,
            pop: last.popularity,
            name: last.name,
            id: last.id,
          })
        : null;

    // Separate batched lookup instead of a JOIN: a join would multiply rows
    // (and corrupt limit/cursor math) if a food ever held two default rows.
    const defaults =
      page.length === 0
        ? []
        : await this.db
            .select({
              id: foodPortions.id,
              foodId: foodPortions.foodId,
              label: foodPortions.label,
              amountInBase: foodPortions.amountInBase,
            })
            .from(foodPortions)
            .where(
              and(
                inArray(
                  foodPortions.foodId,
                  page.map((r) => r.id),
                ),
                eq(foodPortions.isDefault, true),
              ),
            );
    const defaultByFood = new Map(defaults.map((d) => [d.foodId, d]));

    const items: FoodListItemDto[] = page.map((row) => {
      const portion = defaultByFood.get(row.id);
      return {
        id: row.id,
        name: row.name,
        brand: row.brand,
        source: row.source,
        baseUnit: row.baseUnit,
        servingSize: row.servingSize,
        servingLabel: row.servingLabel,
        energyKcal: row.energyKcal,
        proteinG: row.proteinG,
        carbsG: row.carbsG,
        fatG: row.fatG,
        isVerified: row.isVerified,
        isOwned: userId !== null && row.ownerId === userId,
        defaultPortion: portion
          ? {
              id: portion.id,
              label: portion.label,
              amountInBase: portion.amountInBase,
            }
          : null,
      };
    });

    return { items, nextCursor };
  }

  async getFood(userId: string | null, id: string): Promise<FoodDto> {
    const food = await this.loadVisible(userId, id);
    // Fire-and-forget popularity bump so ranking improves with usage. Never
    // awaited on the response path; a read must not fail over ranking
    // bookkeeping, so errors are swallowed (`.catch` also starts the lazy
    // drizzle builder). Leaves updatedAt/version alone on purpose —
    // popularity is ranking metadata, not a content change.
    void this.db
      .update(foods)
      .set({ popularity: sql`${foods.popularity} + 1` })
      .where(eq(foods.id, id))
      .catch(() => {});
    return toFoodDto(food, await this.loadPortions(id));
  }

  async updateFood(
    userId: string,
    id: string,
    patch: UpdateFoodInput,
  ): Promise<FoodDto> {
    const food = await this.loadVisible(userId, id);
    if (food.ownerId === null) {
      throw new ForbiddenException("System foods cannot be modified");
    }

    const set: Partial<typeof foods.$inferInsert> = {};
    if (patch.name !== undefined) set.name = patch.name;
    if (patch.brand !== undefined) set.brand = patch.brand;
    if (patch.description !== undefined) set.description = patch.description;
    if (patch.barcode !== undefined) set.barcode = patch.barcode;
    if (patch.baseUnit !== undefined) set.baseUnit = patch.baseUnit;
    if (patch.servingSize !== undefined) set.servingSize = patch.servingSize;
    if (patch.servingLabel !== undefined) set.servingLabel = patch.servingLabel;
    if (patch.energyKcal !== undefined) set.energyKcal = patch.energyKcal;
    if (patch.proteinG !== undefined) set.proteinG = patch.proteinG;
    if (patch.carbsG !== undefined) set.carbsG = patch.carbsG;
    if (patch.fatG !== undefined) set.fatG = patch.fatG;
    if (patch.nutrients !== undefined) set.nutrients = patch.nutrients;
    if (patch.visibility !== undefined) set.visibility = patch.visibility;

    try {
      const [updated] = await this.db
        .update(foods)
        .set({
          ...set,
          version: sql`${foods.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(foods.id, id),
            eq(foods.ownerId, userId),
            isNull(foods.deletedAt),
          ),
        )
        .returning();
      if (!updated) throw new NotFoundException("Food not found");
      return toFoodDto(updated, await this.loadPortions(id));
    } catch (error) {
      if (isPgError(error, "23505")) {
        throw new ConflictException("A food with this barcode already exists");
      }
      throw error;
    }
  }

  async deleteFood(userId: string, id: string): Promise<void> {
    const food = await this.loadVisible(userId, id);
    if (food.ownerId === null) {
      throw new ForbiddenException("System foods cannot be deleted");
    }
    await this.db
      .update(foods)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(foods.id, id),
          eq(foods.ownerId, userId),
          isNull(foods.deletedAt),
        ),
      );
  }

  /** Not found, soft-deleted, and other users' foods all 404 — never leak. */
  private async loadVisible(
    userId: string | null,
    id: string,
  ): Promise<FoodRow> {
    const [row] = await this.db
      .select()
      .from(foods)
      .where(
        and(
          eq(foods.id, id),
          isNull(foods.deletedAt),
          userId
            ? or(eq(foods.ownerId, userId), isNull(foods.ownerId))!
            : isNull(foods.ownerId),
        ),
      );
    if (!row) throw new NotFoundException("Food not found");
    return row;
  }

  private async loadPortions(foodId: string): Promise<PortionRow[]> {
    return this.db
      .select()
      .from(foodPortions)
      .where(eq(foodPortions.foodId, foodId))
      .orderBy(desc(foodPortions.isDefault), asc(foodPortions.label));
  }
}
