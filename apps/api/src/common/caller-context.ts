import {
  Inject,
  Injectable,
  Scope,
  UnauthorizedException,
} from "@nestjs/common";
import { REQUEST } from "@nestjs/core";
import { z } from "zod";

// Structural type instead of FastifyRequest: fastify is a transitive dep of
// @nestjs/platform-fastify and not resolvable under pnpm isolated linking.
type IncomingRequest = {
  headers: Record<string, string | string[] | undefined>;
};

const userIdSchema = z.uuid();

/**
 * TODO(auth): interim caller identity resolved from the `x-user-id` header.
 * Swap this provider for the real auth module (token verification) later —
 * consumers only depend on `userId` / `requireUserId()`.
 */
@Injectable({ scope: Scope.REQUEST })
export class CallerContext {
  constructor(@Inject(REQUEST) private readonly request: IncomingRequest) {}

  /** Caller user id, or null when anonymous. Malformed header → 401. */
  get userId(): string | null {
    const raw = this.request.headers["x-user-id"];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value === undefined || value === "") return null;
    const parsed = userIdSchema.safeParse(value);
    if (!parsed.success) {
      throw new UnauthorizedException("x-user-id must be a UUID");
    }
    return parsed.data;
  }

  requireUserId(): string {
    const id = this.userId;
    if (id === null) {
      throw new UnauthorizedException("Missing x-user-id header");
    }
    return id;
  }
}
