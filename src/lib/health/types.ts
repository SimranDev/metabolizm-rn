/**
 * Shared types for the health-math core. All calculations operate on canonical
 * units (kilograms / centimetres / years); UI units are converted at the edges
 * in `units.ts`.
 */

export type Sex = 'male' | 'female' | 'other';

export type Goal = 'lose' | 'gain-muscle' | 'recomp' | 'maintain' | 'improve-health';

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'very' | 'athlete';

export type WeightUnit = 'kg' | 'lb' | 'st';
export type HeightUnit = 'cm' | 'ftin';

export type PlanId = 'relaxed' | 'steady' | 'accelerated' | 'vigorous' | 'lean' | 'fast' | 'custom';

/** Canonical, unit-normalised inputs to every calculation. */
export type Metrics = {
  sex: Sex;
  ageYears: number;
  heightCm: number;
  weightKg: number;
  /** Absent for the `maintain` goal. */
  goalWeightKg?: number;
  goal: Goal;
  activityLevel: ActivityLevel;
};

export type Macros = {
  proteinG: number;
  carbsG: number;
  fatG: number;
};

export type Plan = {
  id: PlanId;
  label: string;
  /** Short human description, e.g. "Lose ~0.5 kg per week". */
  description: string;
  /** Signed daily calorie target. */
  targetCalories: number;
  macros: Macros;
  /** Signed weekly weight change in kg (negative = loss, positive = gain). */
  weeklyRateKg: number;
  /** Weeks to reach the goal weight, or null when not applicable. */
  projectedWeeks: number | null;
  /** Projected goal date (ISO), or null when not applicable. */
  projectedDate: string | null;
  /** Calories were raised to the safe floor. */
  clamped: boolean;
  /** Rate exceeds ~1% of bodyweight per week — offer with caution. */
  exceedsSafeRate: boolean;
};
