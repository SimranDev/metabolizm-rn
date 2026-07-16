/**
 * Shared API contract types between apps/api and apps/mobile.
 */

/** Response shape of GET /v1/health. */
export type HealthResponse = {
  status: "ok";
  version: string;
  timestamp: string;
};
