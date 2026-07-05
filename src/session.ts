// Thin session helper over Hono's signed-cookie helpers. One signed cookie holds
// a JSON payload; no store, no driver. A `_middleware.ts` auth guard reads it via
// getSession(c, secret). See README's session section.

import type { Context } from "hono";
import type { CookieOptions } from "hono/utils/cookie";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";

const DEFAULT_NAME = "session";
const DEFAULT_MAX_AGE = 60 * 60 * 24 * 7; // 7 days, in seconds

// `secure` is added per-request in getSession, not here — see there.
const DEFAULT_COOKIE: CookieOptions = {
  httpOnly: true,
  sameSite: "Lax",
  path: "/",
  maxAge: DEFAULT_MAX_AGE,
};

export interface SessionOptions {
  /** Cookie name. Default "session". */
  name?: string;
  /**
   * Attributes merged over the defaults; wins over the auto `secure`.
   * `maxAge` (default 7 days) also sets the signed expiry checked on read.
   */
  cookie?: CookieOptions;
}

/**
 * A session backed by one signed cookie. `data` is the decoded payload (`{}` if
 * absent, tampered, or expired); `set` re-signs and writes it; `destroy` clears
 * it. Each `set` restamps the expiry, so an active session keeps rolling.
 */
export interface Session<T extends Record<string, unknown>> {
  readonly data: Partial<T>;
  /** Merge fields into the payload and write the signed cookie. */
  set(values: Partial<T>): Promise<void>;
  destroy(): void;
}

/**
 * Read (and later write) a signed-cookie session on the Hono context. Await it
 * for the current payload, then call `set`/`destroy` from a loader/action.
 *
 * ```ts
 * const session = await getSession(c, Deno.env.get("SESSION_SECRET")!);
 * if (!session.data.userId) return c.redirect("/login");
 * await session.set({ userId });
 * ```
 */
export async function getSession<T extends Record<string, unknown>>(
  c: Context,
  secret: string,
  options: SessionOptions = {},
): Promise<Session<T>> {
  const name = options.name ?? DEFAULT_NAME;
  // Secure off on local dev hosts so an HTTP cookie isn't dropped; behind a proxy
  // that terminates TLS on a local host, override with { cookie: { secure: true } }.
  const hostname = new URL(c.req.url).hostname;
  const secure = hostname !== "localhost" && hostname !== "127.0.0.1";
  const cookieOpts: CookieOptions = {
    secure,
    ...DEFAULT_COOKIE,
    ...options.cookie,
  };
  // Also stamps the signed exp, so a captured cookie expires server-side.
  const maxAge = cookieOpts.maxAge ?? DEFAULT_MAX_AGE;

  // getSignedCookie returns false on a bad signature, undefined when absent.
  const raw = await getSignedCookie(c, secret, name);
  let data: Partial<T> = {};
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { data?: Partial<T>; exp?: number };
      // Missing exp reads as expired — deliberately kills pre-exp cookies.
      if (typeof parsed.exp === "number" && Date.now() < parsed.exp) {
        data = parsed.data ?? {};
      }
    } catch {
      // malformed payload — data stays empty
    }
  }

  return {
    // Getter so a set() in the same request is reflected on a subsequent read.
    get data() {
      return data;
    },
    async set(values) {
      data = { ...data, ...values };
      const payload = { data, exp: Date.now() + maxAge * 1000 };
      await setSignedCookie(
        c,
        name,
        JSON.stringify(payload),
        secret,
        cookieOpts,
      );
    },
    destroy() {
      data = {};
      deleteCookie(c, name, cookieOpts);
    },
  };
}
