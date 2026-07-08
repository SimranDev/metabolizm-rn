/**
 * Assembles the canonical `Metrics` object the health-math core needs from the
 * raw onboarding answers. Returns `null` until every required field is present.
 */

import {
  ageFromDob,
  buildCustomPlan,
  buildPlans,
  defaultPlanId,
  type Metrics,
  type Plan,
} from '@/lib/health';
import type { OnboardingAnswers } from '@/store/onboarding';

export function buildMetrics(a: OnboardingAnswers): Metrics | null {
  if (
    !a.sex ||
    !a.dob ||
    a.heightCm == null ||
    a.weightKg == null ||
    !a.goal ||
    !a.activityLevel
  ) {
    return null;
  }
  return {
    sex: a.sex,
    ageYears: ageFromDob(new Date(a.dob)),
    heightCm: a.heightCm,
    weightKg: a.weightKg,
    goalWeightKg: a.goalWeightKg,
    goal: a.goal,
    activityLevel: a.activityLevel,
  };
}

/** Resolve the finalized plan the user picked, honouring a custom pace. */
export function resolveSelectedPlan(a: OnboardingAnswers, metrics: Metrics): Plan {
  const presets = buildPlans(metrics);
  const id = a.selectedPlanId ?? defaultPlanId(metrics.goal);
  if (id === 'custom' && a.customWeeklyRateKg != null) {
    return buildCustomPlan(metrics, a.customWeeklyRateKg);
  }
  return presets.find((p) => p.id === id) ?? presets[0];
}
