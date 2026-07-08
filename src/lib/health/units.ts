/**
 * Unit conversions. Calculations run on canonical kg / cm / years; these helpers
 * convert to and from the units a user enters (kg / lb / stone, cm / ft-in).
 */

import type { WeightUnit } from './types';

export const KG_PER_LB = 0.45359237;
export const LB_PER_STONE = 14;
export const KG_PER_STONE = KG_PER_LB * LB_PER_STONE;
export const CM_PER_IN = 2.54;
export const IN_PER_FT = 12;
export const CM_PER_FT = CM_PER_IN * IN_PER_FT;

export const lbToKg = (lb: number) => lb * KG_PER_LB;
export const kgToLb = (kg: number) => kg / KG_PER_LB;

/** Stone as a decimal value (e.g. 12.5 st). */
export const stToKg = (st: number) => st * KG_PER_STONE;
export const kgToSt = (kg: number) => kg / KG_PER_STONE;

/** Stone + pounds, the way UK users usually enter weight (e.g. 12 st 7 lb). */
export const stLbToKg = (st: number, lb: number) => stToKg(st) + lbToKg(lb);
export const kgToStLb = (kg: number): { st: number; lb: number } => {
  const totalLb = kgToLb(kg);
  const st = Math.floor(totalLb / LB_PER_STONE);
  const lb = Math.round(totalLb - st * LB_PER_STONE);
  // Rounding pounds up to a full stone should carry.
  return lb === LB_PER_STONE ? { st: st + 1, lb: 0 } : { st, lb };
};

export const ftInToCm = (ft: number, inches: number) => ft * CM_PER_FT + inches * CM_PER_IN;
export const cmToFtIn = (cm: number): { ft: number; in: number } => {
  const totalIn = cm / CM_PER_IN;
  const ft = Math.floor(totalIn / IN_PER_FT);
  const inches = Math.round(totalIn - ft * IN_PER_FT);
  return inches === IN_PER_FT ? { ft: ft + 1, in: 0 } : { ft, in: inches };
};

/** Convert an entered weight value in the given unit to canonical kilograms. */
export const toKg = (value: number, unit: WeightUnit): number => {
  switch (unit) {
    case 'kg':
      return value;
    case 'lb':
      return lbToKg(value);
    case 'st':
      return stToKg(value);
  }
};

/** Convert canonical kilograms to the given display unit. */
export const fromKg = (kg: number, unit: WeightUnit): number => {
  switch (unit) {
    case 'kg':
      return kg;
    case 'lb':
      return kgToLb(kg);
    case 'st':
      return kgToSt(kg);
  }
};

/** Whole years between a date of birth and `now` (defaults to today). */
export const ageFromDob = (dob: Date, now: Date = new Date()): number => {
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age;
};
