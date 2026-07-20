/**
 * Regression suite for the weight math. The second of the repo's two suites
 * (see CLAUDE.md → Commands), and it exists for the same reason as the masking
 * one: a sign error in the trend slope or a clamp bug in progressPct produces
 * a plausible-looking number that no type check catches, shown to someone
 * making decisions about their health.
 *
 * Pure functions only — no database, no HTTP, no Nest DI.
 */
import { describe, expect, it } from "vitest";

import { localDateFor } from "../groups/dates";
import {
  bucketFor,
  computeMilestones,
  DAY_WEIGHT_RULE,
  emaSeries,
  isPlausibleKg,
  MAX_SERIES_POINTS,
  pickDayWeightKg,
  progressPct,
  projectGoalDate,
  rangeWindow,
  toKg,
  trailingAvgKg,
  trendKgPerWeek,
  weightStreakDays,
  type DayWeightInput,
} from "./compute";
import type { WeightRange, WeightSeriesPoint } from "@metabolizm/shared";

const at = (iso: string) => new Date(iso);

const entry = (
  weightKg: number,
  loggedAt: string,
  deletedAt: string | null = null,
): DayWeightInput => ({
  weightKg,
  loggedAt: at(loggedAt),
  deletedAt: deletedAt === null ? null : at(deletedAt),
});

/** `count` daily points starting at `start`, changing by `stepKg` each day. */
function ramp(
  start: string,
  count: number,
  fromKgValue: number,
  stepKg: number,
): WeightSeriesPoint[] {
  const base = Date.parse(`${start}T00:00:00Z`);
  return Array.from({ length: count }, (_, i) => ({
    d: new Date(base + i * 86_400_000).toISOString().slice(0, 10),
    kg: Math.round((fromKgValue + i * stepKg) * 100) / 100,
  }));
}

describe("pickDayWeightKg", () => {
  const day = [
    entry(72.1, "2026-07-20T07:02:00Z"),
    entry(72.9, "2026-07-20T13:40:00Z"),
    entry(73.4, "2026-07-20T19:15:00Z"),
  ];

  it("picks the day's canonical weigh-in per DAY_WEIGHT_RULE", () => {
    // Guards the constant itself: flipping it must be the only edit needed.
    expect(pickDayWeightKg(day)).toBe(
      DAY_WEIGHT_RULE === "earliest" ? 72.1 : 73.4,
    );
  });

  it("promotes the next entry when the canonical one is deleted", () => {
    const afterDelete = [
      entry(72.1, "2026-07-20T07:02:00Z", "2026-07-20T20:00:00Z"),
      ...day.slice(1),
    ];
    expect(pickDayWeightKg(afterDelete)).toBe(
      DAY_WEIGHT_RULE === "earliest" ? 72.9 : 73.4,
    );
  });

  it("returns null once every entry for the day is tombstoned", () => {
    expect(
      pickDayWeightKg(day.map((e) => ({ ...e, deletedAt: at("2026-07-21T00:00:00Z") }))),
    ).toBeNull();
    expect(pickDayWeightKg([])).toBeNull();
  });
});

describe("unit conversion", () => {
  it("round-trips lb to kg and back within 0.1 lb", () => {
    for (const lb of [110, 154.3, 159, 200.5, 320]) {
      const kg = toKg(lb, "lb");
      expect(Math.abs(kg / 0.45359237 - lb)).toBeLessThan(0.1);
    }
  });

  it("round-trips stone within 0.1 lb", () => {
    for (const st of [8, 11.5, 15.2, 22]) {
      const kg = toKg(st, "st");
      expect(Math.abs(kg / (0.45359237 * 14) - st) * 14).toBeLessThan(0.1);
    }
  });

  it("rejects grossly out-of-range weights", () => {
    expect(isPlausibleKg(toKg(550, "kg"))).toBe(false);
    expect(isPlausibleKg(toKg(15, "kg"))).toBe(false);
    expect(isPlausibleKg(toKg(165, "lb"))).toBe(true);
  });

  it("does NOT catch a mid-range pound value entered as kilograms", () => {
    // Worth pinning down, because the constraint is easily over-trusted: 165
    // as kg is 165 kg, which is a real (if high) human weight and passes. The
    // 20–500 bound only catches gross errors — a 165 lb user who picks the
    // wrong unit gets a plausible-but-wrong row, so the UI has to make the
    // selected unit obvious rather than relying on the server to notice.
    expect(isPlausibleKg(toKg(165, "kg"))).toBe(true);
  });

  it("catches the rounding boundary that would 500 instead of 400", () => {
    // 44.1 lb is 20.0035 kg, which rounds to exactly 20.00 — outside the DB's
    // exclusive `> 20`. Validating the raw input instead of the rounded kg
    // lets this through to Postgres as a 23514.
    expect(toKg(44.1, "lb")).toBe(20);
    expect(isPlausibleKg(toKg(44.1, "lb"))).toBe(false);
  });
});

describe("emaSeries + trendKgPerWeek", () => {
  it("recovers a known slope from a steady decline", () => {
    // 30 days at -0.1 kg/day is exactly -0.7 kg/week.
    const daily = ramp("2026-06-21", 30, 78, -0.1);
    const trend = trendKgPerWeek(emaSeries(daily), "2026-07-20");
    expect(trend).not.toBeNull();
    // The EMA lags a ramp by a constant, so the slope survives; allow for the
    // lag still settling across the 14-day fit window.
    expect(trend!).toBeLessThan(-0.4);
    expect(trend!).toBeGreaterThan(-0.75);
  });

  it("returns a positive slope for a gain", () => {
    const daily = ramp("2026-06-21", 30, 62, 0.1);
    expect(trendKgPerWeek(emaSeries(daily), "2026-07-20")!).toBeGreaterThan(0.4);
  });

  it("returns null with fewer than 4 points in the 14-day window", () => {
    const sparse: WeightSeriesPoint[] = [
      { d: "2026-07-10", kg: 74 },
      { d: "2026-07-14", kg: 73.8 },
      { d: "2026-07-19", kg: 73.6 },
    ];
    expect(trendKgPerWeek(emaSeries(sparse), "2026-07-20")).toBeNull();
  });

  it("returns null when every point shares one date (zero x-variance)", () => {
    const same: WeightSeriesPoint[] = Array.from({ length: 5 }, () => ({
      d: "2026-07-20",
      kg: 74,
    }));
    expect(trendKgPerWeek(same, "2026-07-20")).toBeNull();
  });

  it("does not bleed a pre-gap decline into the current trend", () => {
    // Dropped fast in May, stopped logging for five weeks, flat all July. A
    // per-sample EMA reports -1.69 kg/wk here — a loss the user is not making
    // and a goal date built on it. The per-elapsed-day alpha is what fixes it.
    const old = ramp("2026-05-01", 30, 90, -0.5);
    const recent = ramp("2026-07-07", 14, 75, 0);
    const trend = trendKgPerWeek(emaSeries([...old, ...recent]), "2026-07-20");
    expect(Math.abs(trend!)).toBeLessThan(0.35);
  });
});

describe("projectGoalDate", () => {
  const base = {
    currentEmaKg: 72.1,
    targetKg: 68,
    asOf: "2026-07-20",
  };

  it("projects a date when the trend moves toward the goal", () => {
    // 4.1 kg to go at 0.4 kg/week ≈ 10.25 weeks ≈ 72 days.
    expect(projectGoalDate({ ...base, trendKgPerWeek: -0.4 })).toBe("2026-09-30");
  });

  it("returns null for a flat trend", () => {
    expect(projectGoalDate({ ...base, trendKgPerWeek: -0.04 })).toBeNull();
    expect(projectGoalDate({ ...base, trendKgPerWeek: 0 })).toBeNull();
  });

  it("returns null when the trend points away from the goal", () => {
    expect(projectGoalDate({ ...base, trendKgPerWeek: 0.4 })).toBeNull();
  });

  it("returns null beyond two years out", () => {
    // A real trend (past the flat guard) but a journey too long to promise:
    // 52 kg at 0.4/wk is 130 weeks.
    expect(
      projectGoalDate({
        currentEmaKg: 120,
        targetKg: 68,
        trendKgPerWeek: -0.4,
        asOf: "2026-07-20",
      }),
    ).toBeNull();
  });

  it("still projects a slow but real trend inside the horizon", () => {
    // 4.1 kg at 0.05/wk is 82 weeks — long, but honest and under the cap.
    expect(projectGoalDate({ ...base, trendKgPerWeek: -0.05 })).toBe("2028-02-14");
  });

  it("returns null for a sparse (null) trend or no goal", () => {
    expect(projectGoalDate({ ...base, trendKgPerWeek: null })).toBeNull();
    expect(
      projectGoalDate({ ...base, targetKg: null, trendKgPerWeek: -0.4 }),
    ).toBeNull();
  });

  it("projects for a weight-gain goal", () => {
    const gain = projectGoalDate({
      currentEmaKg: 62,
      targetKg: 66,
      trendKgPerWeek: 0.4,
      asOf: "2026-07-20",
    });
    expect(gain).toBe("2026-09-28");
  });
});

describe("progressPct", () => {
  it("measures a loss journey", () => {
    expect(progressPct(77, 72.1, 68)).toBe(54);
  });

  it("measures a gain journey with the same formula", () => {
    // Signs cancel: started 60, want 70, at 65 → halfway.
    expect(progressPct(60, 65, 70)).toBe(50);
  });

  it("clamps outside 0–100", () => {
    expect(progressPct(77, 80, 68)).toBe(0); // moved the wrong way
    expect(progressPct(77, 66, 68)).toBe(100); // overshot the goal
  });

  it("returns null when start equals target", () => {
    expect(progressPct(72, 72, 72)).toBeNull();
  });

  it("is 0 on the day a goal is set", () => {
    // startingKg snapshots today's weight, so the UI must not read this as
    // "you've made no progress".
    expect(progressPct(72.1, 72.1, 68)).toBe(0);
  });
});

describe("trailingAvgKg", () => {
  const daily = ramp("2026-06-21", 30, 75, -0.1);

  it("averages only the trailing window", () => {
    // 30 days from 75.0 down to 72.1: last 7 average 72.4, all 30 average 73.55.
    expect(trailingAvgKg(daily, "2026-07-20", 7)).toBe(72.4);
    expect(trailingAvgKg(daily, "2026-07-20", 30)).toBe(73.55);
  });

  it("returns null with no points in the window", () => {
    expect(trailingAvgKg([], "2026-07-20", 7)).toBeNull();
    expect(trailingAvgKg(daily, "2026-09-01", 7)).toBeNull();
  });
});

describe("weightStreakDays", () => {
  it("counts consecutive days ending today", () => {
    const dates = ["2026-07-18", "2026-07-19", "2026-07-20"];
    expect(weightStreakDays(dates, "2026-07-20")).toBe(3);
  });

  it("does not break the streak when today isn't logged yet", () => {
    const dates = ["2026-07-17", "2026-07-18", "2026-07-19"];
    expect(weightStreakDays(dates, "2026-07-20")).toBe(3);
  });

  it("breaks on a day that ended empty", () => {
    const dates = ["2026-07-15", "2026-07-16", "2026-07-19", "2026-07-20"];
    expect(weightStreakDays(dates, "2026-07-20")).toBe(2);
  });

  it("survives a DST transition", () => {
    // US spring-forward 2026-03-08: the 8th is a 23-hour local day. All date
    // math is UTC-anchored, so the run must stay unbroken.
    const dates = ["2026-03-06", "2026-03-07", "2026-03-08", "2026-03-09"];
    expect(weightStreakDays(dates, "2026-03-09")).toBe(4);
  });

  it("counts a different streak per timezone from one instant", () => {
    // 2026-07-20T05:30:00Z is still the 19th in Los Angeles and already the
    // 20th in Kolkata — the same log set yields different streaks.
    const instant = new Date("2026-07-20T05:30:00Z");
    const la = localDateFor("America/Los_Angeles", instant);
    const kolkata = localDateFor("Asia/Kolkata", instant);
    expect(la).toBe("2026-07-19");
    expect(kolkata).toBe("2026-07-20");

    const dates = ["2026-07-17", "2026-07-18", "2026-07-19"];
    expect(weightStreakDays(dates, la)).toBe(3);
    // In Kolkata today simply isn't logged yet — same unbroken run.
    expect(weightStreakDays(dates, kolkata)).toBe(3);
  });

  it("is 0 with no entries", () => {
    expect(weightStreakDays([], "2026-07-20")).toBe(0);
  });
});

describe("rangeWindow + bucketFor", () => {
  const cases: [WeightRange, string, number][] = [
    ["1W", "day", 7],
    ["1M", "day", 30],
    ["3M", "day", 90],
    ["1Y", "week", 53],
  ];

  it.each(cases)("%s buckets by %s within the point cap", (range, bucket) => {
    const { from, to } = rangeWindow(range, "2026-07-20", "2020-01-01");
    expect(bucketFor(range, from, to)).toBe(bucket);
  });

  it("keeps every range under the payload cap", () => {
    for (const [, , maxPoints] of cases) {
      expect(maxPoints).toBeLessThanOrEqual(MAX_SERIES_POINTS);
    }
  });

  it("switches ALL from weekly to monthly past two years", () => {
    const short = rangeWindow("ALL", "2026-07-20", "2025-07-20");
    expect(bucketFor("ALL", short.from, short.to)).toBe("week");

    // 729 days ≈ 105 weekly points, still under the cap.
    const justUnder = rangeWindow("ALL", "2026-07-20", "2024-07-23");
    expect(bucketFor("ALL", justUnder.from, justUnder.to)).toBe("week");

    const long = rangeWindow("ALL", "2026-07-20", "2020-01-01");
    expect(bucketFor("ALL", long.from, long.to)).toBe("month");
  });

  it("clamps ALL to today when there are no entries", () => {
    expect(rangeWindow("ALL", "2026-07-20", null)).toEqual({
      from: "2026-07-20",
      to: "2026-07-20",
    });
  });
});

describe("computeMilestones", () => {
  it("emits one threshold per 5 kg crossed downward", () => {
    const daily = ramp("2026-01-01", 160, 96, -0.1); // 96 → 80.1
    const out = computeMilestones({
      daily,
      startingKg: 96,
      targetKg: 70,
      unit: "kg",
    });
    const thresholds = out.filter((m) => m.kind === "threshold");
    expect(thresholds.map((m) => m.valueKg)).toEqual([85, 90, 95]);
  });

  it("fires each threshold once, however often the line is re-crossed", () => {
    // Real weight wanders a kilogram either side of a boundary for weeks. If
    // re-crossing re-fires, "Crossed under 75 kg" shows up four times in a
    // fortnight and stops meaning anything.
    const down = ramp("2026-01-01", 20, 76, -0.2); // 76 → 72.2
    const up = ramp("2026-01-21", 20, 72.2, 0.2); // back to 76
    const again = ramp("2026-02-10", 20, 76, -0.2); // and down again
    const out = computeMilestones({
      daily: [...down, ...up, ...again],
      startingKg: 76,
      targetKg: 70,
      unit: "kg",
    });
    const thresholds = out.filter((m) => m.kind === "threshold");
    expect(thresholds.map((m) => m.valueKg)).toEqual([75]);
  });

  it("emits every band crossed in a single jump", () => {
    // A month between weigh-ins shouldn't swallow the milestones in between.
    const out = computeMilestones({
      daily: [
        { d: "2026-01-01", kg: 96 },
        { d: "2026-02-01", kg: 83 },
      ],
      startingKg: 96,
      targetKg: 70,
      unit: "kg",
    });
    expect(out.filter((m) => m.kind === "threshold").map((m) => m.valueKg)).toEqual([
      85, 90, 95,
    ]);
  });

  it("denominates thresholds in the display unit", () => {
    // 170 lb is 77.11 kg; crossing it must report that, not a round kg.
    const daily = ramp("2026-01-01", 40, 78, -0.1); // 78 → 74.1 kg
    const out = computeMilestones({
      daily,
      startingKg: 78,
      targetKg: 70,
      unit: "lb",
    });
    const crossed = out.filter((m) => m.kind === "threshold");
    expect(crossed.length).toBeGreaterThan(0);
    expect(crossed.map((m) => m.valueKg)).toContain(77.11);
  });

  it("does not announce an all-time low every day of a decline", () => {
    const daily = ramp("2026-01-01", 160, 96, -0.1);
    const lows = computeMilestones({
      daily,
      startingKg: 96,
      targetKg: 70,
      unit: "kg",
    }).filter((m) => m.kind === "all-time-low");
    // ~5 over 160 declining days, not 159 — otherwise they'd fill the capped
    // list and push the thresholds off the end.
    expect(lows.length).toBeGreaterThan(2);
    expect(lows.length).toBeLessThan(8);
  });

  it("emits goal-reached once, for a loss and for a gain", () => {
    const loss = computeMilestones({
      daily: ramp("2026-01-01", 40, 72, -0.1),
      startingKg: 72,
      targetKg: 70,
      unit: "kg",
    });
    expect(loss.filter((m) => m.kind === "goal-reached")).toHaveLength(1);

    const gain = computeMilestones({
      daily: ramp("2026-01-01", 40, 62, 0.1),
      startingKg: 62,
      targetKg: 64,
      unit: "kg",
    });
    expect(gain.filter((m) => m.kind === "goal-reached")).toHaveLength(1);
  });

  it("returns nothing without data", () => {
    expect(
      computeMilestones({ daily: [], startingKg: 80, targetKg: 70, unit: "kg" }),
    ).toEqual([]);
  });

  it("returns newest first", () => {
    const out = computeMilestones({
      daily: ramp("2026-01-01", 160, 96, -0.1),
      startingKg: 96,
      targetKg: 70,
      unit: "kg",
    });
    const dates = out.map((m) => m.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });
});
