import { defineConfig } from "vitest/config";

// Deliberately narrow: the repo has no general test runner. Two suites only,
// both guarding logic where a wrong answer is silent and plausible —
// groups/masking.test.ts (CLAUDE.md "Groups — the masking invariant") and
// weight/compute.test.ts (trend, projection and progress math). Neither is an
// invitation to add unit tests elsewhere.
export default defineConfig({
  test: {
    include: ["apps/api/src/**/*.test.ts"],
  },
});
