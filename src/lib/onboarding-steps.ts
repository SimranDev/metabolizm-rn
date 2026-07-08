/** Ordered "question" steps, used to drive the onboarding progress bar. */
export const ONBOARDING_STEPS = [
  'goal',
  'gender',
  'dob',
  'height',
  'weight',
  'goal-weight',
  'activity',
  'plan',
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const stepProgress = (step: OnboardingStep): number =>
  (ONBOARDING_STEPS.indexOf(step) + 1) / ONBOARDING_STEPS.length;
