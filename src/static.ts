// Production static-file handler: serves files under fsRoot, then hands
// unmatched requests to a fallthrough (typically the SSR app). Dev serves
// assets through Vite, so this is prod-only. See the template's server.prod.ts.

import { serveDir } from "@std/http/file-server";

export interface ServeStaticOptions {
  /** Directory to serve from (e.g. dist/client). */
  fsRoot: string;
  /**
   * Handles requests with no matching file on disk (serveDir 404s). Usually the
   * SSR app's `fetch`. Omit to return serveDir's 404 unchanged.
   */
  fallthrough?: (req: Request) => Response | Promise<Response>;
  /**
   * Cache-Control for a served file, by request pathname. Return undefined to
   * leave serveDir's headers as-is. serveDir sets none, so most callers set one.
   */
  cacheControl?: (pathname: string) => string | undefined;
}

/**
 * Build a fetch-style handler that serves static files, then falls through.
 *
 * serveDir handles path-safety, ETag/304, range, HEAD, and content-type; it
 * only lacks Cache-Control, which `cacheControl` supplies. Only 404 (no file)
 * falls through — a 405 etc. is serveDir's correct answer, not a miss.
 */
export function serveStatic(
  opts: ServeStaticOptions,
): (req: Request) => Promise<Response> {
  const { fsRoot, fallthrough, cacheControl } = opts;
  return async (req: Request): Promise<Response> => {
    const res = await serveDir(req, { fsRoot, quiet: true });
    if (res.status === 404 && fallthrough) {
      await res.body?.cancel();
      return fallthrough(req);
    }
    if (cacheControl && (res.ok || res.status === 304)) {
      const value = cacheControl(new URL(req.url).pathname);
      if (value !== undefined) {
        const headers = new Headers(res.headers);
        headers.set("Cache-Control", value);
        return new Response(res.body, { status: res.status, headers });
      }
    }
    return res;
  };
}
