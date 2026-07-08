/**
 * Turns a user's metrics into the selectable calorie/macro plans, with health
 * guardrails applied (calorie floor, safe-rate cap). A "plan" is a signed daily
 * calorie delta off maintenance; deficits drive weight loss, surpluses drive gain.
 */

import {
  CALORIE_FLOOR,
  KCAL_PER_KG,
  macrosFor,
  maintenanceCalories,
  safeWeeklyRateKg,
} from './calc';
import type { Goal, Metrics, Plan, PlanId } from './types';

/** Daily kcal delta that produces a given weekly weight change. */
const dailyDeltaForRate = (weeklyRateKg: number) => (weeklyRateKg * KCAL_PER_KG) / 7;

const addDays = (from: Date, days: number): Date => {
  const d = new Date(from);
  d.setDate(d.getDate() + Math.round(days));
  return d;
};

type PlanSpec = {
  id: PlanId;
  label: string;
  description: string;
  /** Signed daily calorie delta off maintenance (negative = deficit). */
  dailyDelta: number;
};

/** Deficit ladder for weight loss, derived from weekly rate targets. */
const LOSS_RATES: { id: PlanId; label: string; rate: number }[] = [
  { id: 'relaxed', label: 'Relaxed', rate: 0.25 },
  { id: 'steady', label: 'Steady', rate: 0.5 },
  { id: 'accelerated', label: 'Accelerated', rate: 0.75 },
  { id: 'vigorous', label: 'Vigorous', rate: 1.0 },
];

/** Surplus ladder for muscle gain, keyed on daily surplus. */
const GAIN_SURPLUS: { id: PlanId; label: string; delta: number }[] = [
  { id: 'lean', label: 'Lean', delta: 250 },
  { id: 'steady', label: 'Steady', delta: 350 },
  { id: 'fast', label: 'Fast', delta: 500 },
];

const rateLabel = (rateKg: number) =>
  `${rateKg % 1 === 0 ? rateKg.toFixed(0) : rateKg.toFixed(2)} kg`;

const specsForGoal = (m: Metrics): PlanSpec[] => {
  switch (m.goal) {
    case 'lose':
      return LOSS_RATES.map(({ id, label, rate }) => ({
        id,
        label,
        description: `Lose ~${rateLabel(rate)} per week`,
        dailyDelta: -dailyDeltaForRate(rate),
      }));
    case 'gain-muscle':
      return GAIN_SURPLUS.map(({ id, label, delta }) => ({
        id,
        label,
        description: `Gain slowly · +${delta} kcal/day`,
        dailyDelta: delta,
      }));
    case 'recomp':
      return [
        {
          id: 'steady',
          label: 'Recomposition',
          description: 'Eat at maintenance, high protein',
          dailyDelta: 0,
        },
      ];
    case 'improve-health':
      // Gentle deficit when there is weight to lose, otherwise maintain.
      if (m.goalWeightKg != null && m.goalWeightKg < m.weightKg) {
        return LOSS_RATES.slice(0, 2).map(({ id, label, rate }) => ({
          id,
          label,
          description: `Lose ~${rateLabel(rate)} per week`,
          dailyDelta: -dailyDeltaForRate(rate),
        }));
      }
      return [{ id: 'steady', label: 'Maintain', description: 'Eat at maintenance', dailyDelta: 0 }];
    case 'maintain':
      return [{ id: 'steady', label: 'Maintain', description: 'Eat at maintenance', dailyDelta: 0 }];
  }
};

/** Build a single plan from a signed daily calorie delta, applying guardrails. */
export const buildPlan = (
  m: Metrics,
  spec: PlanSpec,
  now: Date = new Date(),
): Plan => {
  const maintenance = maintenanceCalories(m);
  const rawTarget = maintenance + spec.dailyDelta;
  const floor = CALORIE_FLOOR[m.sex];
  const clamped = rawTarget < floor;
  const targetCalories = Math.round(Math.max(rawTarget, floor));

  // Rate after any clamping — the achievable, not the requested, pace.
  const effectiveDelta = targetCalories - maintenance;
  const weeklyRateKg = (effectiveDelta * 7) / KCAL_PER_KG;

  let projectedWeeks: number | null = null;
  let projectedDate: string | null = null;
  if (m.goalWeightKg != null && weeklyRateKg !== 0) {
    const distance = m.goalWeightKg - m.weightKg; // signed
    // Only project when the plan actually moves toward the goal.
    if (Math.sign(distance) === Math.sign(weeklyRateKg)) {
      projectedWeeks = distance / weeklyRateKg;
      projectedDate = addDays(now, projectedWeeks * 7).toISOString();
    }
  }

  return {
    id: spec.id,
    label: spec.label,
    description: spec.description,
    targetCalories,
    macros: macrosFor(targetCalories, m.weightKg, m.goal),
    weeklyRateKg,
    projectedWeeks,
    projectedDate,
    clamped,
    exceedsSafeRate: Math.abs(weeklyRateKg) > safeWeeklyRateKg(m.weightKg) + 1e-6,
  };
};

/** All preset plans appropriate to the user's goal. */
export const buildPlans = (m: Metrics, now: Date = new Date()): Plan[] =>
  specsForGoal(m).map((spec) => buildPlan(m, spec, now));

/** Default plan to preselect on the plan screen. */
export const defaultPlanId = (goal: Goal): PlanId =>
  goal === 'gain-muscle' ? 'lean' : 'steady';

/**
 * A custom plan from a signed weekly rate (used by the interactive pace control
 * that recomputes the projected date as the user drags).
 */
export const buildCustomPlan = (m: Metrics, weeklyRateKg: number, now: Date = new Date()): Plan =>
  buildPlan(
    m,
    {
      id: 'custom',
      label: 'Custom',
      description: `${weeklyRateKg < 0 ? 'Lose' : 'Gain'} ~${rateLabel(Math.abs(weeklyRateKg))} per week`,
      dailyDelta: dailyDeltaForRate(weeklyRateKg),
    },
    now,
  );
