// Production entry: `deno task start` after `deno task build`.
// The SSR bundle only exports a Hono app; export a { fetch } handler so
// `deno serve` provides the listener (the Deno Deploy-portable form). Hashed
// client chunks under /assets/ are content-hashed by Vite, so they're immutable
// and served with a one-year cache. A CDN in front is still recommended for
// high traffic. See the README's Deploy section.
import app from "./dist/server/server.mjs";
import { serveDir } from "@std/http/file-server";

const CLIENT_DIR = new URL("./dist/client", import.meta.url).pathname;
const IMMUTABLE = "public, max-age=31536000, immutable";

export default {
  async fetch(req: Request): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (!pathname.startsWith("/assets/")) return app.fetch(req);

    // serveDir handles path-safety, ETag/304, range, HEAD, and content-type;
    // it only lacks Cache-Control. Content-hashed names ⇒ tag hits immutable.
    const res = await serveDir(req, { fsRoot: CLIENT_DIR, quiet: true });
    if (res.ok || res.status === 304) {
      const headers = new Headers(res.headers);
      headers.set("Cache-Control", IMMUTABLE);
      return new Response(res.body, { status: res.status, headers });
    }
    return res;
  },
};
