/**
 * Core energy + body-composition math. Every function here is pure and operates
 * on canonical units (kg / cm / years). Not medical advice — see the guardrails
 * applied in `plans.ts` before any target is shown to a user.
 */

import type { ActivityLevel, Goal, Macros, Metrics, Sex } from './types';

/** Approximate energy in one kilogram of body mass. */
export const KCAL_PER_KG = 7700;

/** Mifflin-St Jeor sex constant. `other` uses the mean of male/female. */
const SEX_CONSTANT: Record<Sex, number> = {
  male: 5,
  female: -161,
  other: -78,
};

export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very: 1.725,
  athlete: 1.9,
};

/**
 * Lowest daily intake we will recommend without professional supervision
 * (commonly cited floors: ~1200 kcal for women, ~1500 for men).
 */
export const CALORIE_FLOOR: Record<Sex, number> = {
  male: 1500,
  female: 1200,
  other: 1200,
};

/** Basal Metabolic Rate — Mifflin-St Jeor equation (kcal/day). */
export const mifflinStJeorBmr = ({
  sex,
  weightKg,
  heightCm,
  ageYears,
}: Pick<Metrics, 'sex' | 'weightKg' | 'heightCm' | 'ageYears'>): number =>
  10 * weightKg + 6.25 * heightCm - 5 * ageYears + SEX_CONSTANT[sex];

/** Total Daily Energy Expenditure (kcal/day) = BMR × activity multiplier. */
export const tdee = (bmr: number, activityLevel: ActivityLevel): number =>
  bmr * ACTIVITY_MULTIPLIERS[activityLevel];

/** Convenience: maintenance calories straight from metrics. */
export const maintenanceCalories = (m: Metrics): number =>
  tdee(mifflinStJeorBmr(m), m.activityLevel);

export const bmi = (weightKg: number, heightCm: number): number => {
  const m = heightCm / 100;
  return weightKg / (m * m);
};

export type BmiCategory = 'underweight' | 'normal' | 'overweight' | 'obese';

export const bmiCategory = (value: number): BmiCategory => {
  if (value < 18.5) return 'underweight';
  if (value < 25) return 'normal';
  if (value < 30) return 'overweight';
  return 'obese';
};

/** Weight (kg) at the lower edge of a healthy BMI for a given height. */
export const minHealthyWeightKg = (heightCm: number): number => {
  const m = heightCm / 100;
  return 18.5 * m * m;
};

/** Max weekly rate we consider safe: ~1% of bodyweight per week. */
export const safeWeeklyRateKg = (weightKg: number): number => weightKg * 0.01;

/**
 * Protein / fat / carb targets for a calorie goal. Protein is the anchor
 * (g per kg of bodyweight); fat has a floor of ~25% of calories for hormone
 * health; carbs fill the remainder.
 */
export const macrosFor = (targetCalories: number, weightKg: number, goal: Goal): Macros => {
  const proteinPerKg = goal === 'gain-muscle' || goal === 'recomp' ? 2.0 : goal === 'lose' ? 1.8 : 1.6;
  const proteinG = proteinPerKg * weightKg;
  const fatG = Math.max(0.8 * weightKg, (0.25 * targetCalories) / 9);

  const proteinKcal = proteinG * 4;
  const fatKcal = fatG * 9;
  const carbsG = Math.max(0, (targetCalories - proteinKcal - fatKcal) / 4);

  return {
    proteinG: Math.round(proteinG),
    fatG: Math.round(fatG),
    carbsG: Math.round(carbsG),
  };
};
