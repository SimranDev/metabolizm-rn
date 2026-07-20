/**
 * Thin fetch wrapper for the Metabolizm backend (apps/api, global prefix /v1).
 * Callers get parsed JSON and `try/catch` the thrown `Error`s (user-facing
 * messages), mirroring `lib/auth`; `AbortError` propagates so callers can
 * cancel in-flight requests.
 */

import { authClient } from "@/lib/auth/client";
import { BASE_URL } from "./base-url";

export type ApiMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

/**
 * A non-2xx response. `status` lets callers branch on meaning — 404 (gone),
 * 409 (already a member / group full), 410 (invite expired or revoked).
 */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type RequestOptions = {
  method?: ApiMethod;
  /** JSON request body. Omit entirely for bodyless writes — see below. */
  body?: unknown;
  signal?: AbortSignal;
};

async function send(path: string, opts: RequestOptions): Promise<Response> {
  // The Better Auth session cookie (cached in SecureStore by the expo
  // plugin); empty when signed out — anonymous callers see the system
  // catalog only. `credentials: "omit"` so the manual header is the only
  // cookie source.
  const cookie = authClient.getCookie();
  const hasBody = opts.body !== undefined;

  return fetch(`${BASE_URL}/v1${path}`, {
    method: opts.method ?? "GET",
    signal: opts.signal,
    credentials: "omit",
    headers: {
      accept: "application/json",
      // Declared only when a body exists: Fastify rejects an empty body sent
      // with a JSON content-type, and some writes take none (POST
      // /groups/:id/leave, DELETE routes).
      ...(hasBody ? { "content-type": "application/json" } : null),
      ...(cookie ? { Cookie: cookie } : null),
    },
    body: hasBody ? JSON.stringify(opts.body) : undefined,
  });
}

/** Nest error bodies are `{ message, error, statusCode }`; message may be a list. */
async function errorMessage(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { message?: unknown };
    const message = body.message;
    if (typeof message === "string" && message.length > 0) return message;
    if (Array.isArray(message) && typeof message[0] === "string") {
      return message[0];
    }
  } catch {
    // Non-JSON or empty body — fall back to the caller's generic message.
  }
  return null;
}

/**
 * Request the API and parse the JSON body as `T`. Throws `ApiError` (with the
 * server's message when it sent one) on a non-2xx, or a plain `Error` on a
 * network failure. `204 No Content` resolves to `undefined`, so callers typing
 * a void endpoint as `Promise<void>` are correct.
 */
export async function apiRequest<T>(
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  let response: Response;
  try {
    response = await send(path, opts);
  } catch (err) {
    // Re-throw cancellations untouched; treat anything else as a network failure.
    if (err instanceof Error && err.name === "AbortError") throw err;
    throw new Error("Couldn't reach Metabolizm. Check your connection.");
  }

  if (!response.ok) {
    const message = await errorMessage(response);
    throw new ApiError(message ?? "Something went wrong. Please try again.", response.status);
  }

  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/**
 * GET a catalog endpoint. Keeps the food-specific copy the search and detail
 * screens surface directly; everything else uses `apiRequest`.
 */
export async function apiFetch<T>(
  path: string,
  opts?: { signal?: AbortSignal },
): Promise<T> {
  try {
    return await apiRequest<T>(path, { signal: opts?.signal });
  } catch (err) {
    if (err instanceof ApiError) {
      throw new Error(
        err.status === 404
          ? "This food is no longer available."
          : "Food search failed. Please try again.",
      );
    }
    if (err instanceof Error && err.name === "AbortError") throw err;
    throw new Error("Couldn't reach the food catalog. Check your connection.");
  }
}
