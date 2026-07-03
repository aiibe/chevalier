// Production entry: `deno task start` after `deno task build`.
// The SSR bundle only exports a Hono app; export a { fetch } handler so
// `deno serve` provides the listener (the Deno Deploy-portable form). Static
// files live under dist/client: hashed chunks in /assets/ (immutable) plus
// public/ files copied to the root (favicon etc., revalidated). Anything not on
// disk falls through to the app's SSR routes. A CDN in front is still
// recommended for high traffic. See the README's Deploy section.
import app from "./dist/server/server.mjs";
import { serveStatic } from "chevalier/static";

const CLIENT_DIR = new URL("./dist/client", import.meta.url).pathname;
// Content-hashed names ⇒ safe to pin forever. Public files keep stable names,
// so they must revalidate or a favicon swap never propagates.
const IMMUTABLE = "public, max-age=31536000, immutable";
const REVALIDATE = "public, no-cache";

export default {
  fetch: serveStatic({
    fsRoot: CLIENT_DIR,
    fallthrough: (req) => app.fetch(req),
    cacheControl: (pathname) =>
      pathname.startsWith("/assets/") ? IMMUTABLE : REVALIDATE,
  }),
};
