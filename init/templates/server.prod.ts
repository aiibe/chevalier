// Production entry: `deno task start` after `deno task build`.
// The SSR bundle only exports a Hono app; export a { fetch } handler so
// `deno serve` provides the listener (the Deno Deploy-portable form). Built
// client chunks are served from dist/client (a real deploy uses a CDN).
import app from "./dist/server/server.mjs";
import { serveDir } from "@std/http/file-server";

const CLIENT_DIR = new URL("./dist/client", import.meta.url).pathname;

export default {
  fetch(req: Request): Response | Promise<Response> {
    return new URL(req.url).pathname.startsWith("/assets/")
      ? serveDir(req, { fsRoot: CLIENT_DIR, quiet: true })
      : app.fetch(req);
  },
};
