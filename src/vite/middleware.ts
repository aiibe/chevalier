// Dev-only Vite connect middleware that hands requests to the SSR app.

import type { Connect, ViteDevServer } from "vite";

// Requests Vite must handle itself, not the SSR app: its client runtime,
// /@fs and /@id specifiers, source files, HMR pings, and public assets.
const VITE_OWNED = [
  /^\/@/, // /@vite/client, /@fs/, /@id/, /@react-refresh
  /\.[cm]?[jt]sx?($|\?)/, // source modules Vite transforms
  /\?(t|import|html-proxy|raw|url|worker)/, // Vite query suffixes
  /^\/node_modules\//,
  /^\/favicon\.ico$/,
];

// HMR client + a reporter of this browser's route, so a route edit reloads only
// matching tabs. Re-reports on history nav to track client-router path changes.
const DEV_HEAD_INJECT = `
<script type="module" src="/@vite/client"></script>
<script type="module">
import { createHotContext } from "/@vite/client";
const hot = createHotContext("/chevalier:route-reporter");
const report = () => hot.send("chevalier:route", { pathname: location.pathname });
report();
for (const m of ["pushState", "replaceState"]) {
  const orig = history[m];
  history[m] = function () { const r = orig.apply(this, arguments); report(); return r; };
}
addEventListener("popstate", report);
</script>`;

// Connect types req as a bare IncomingMessage without the http augmentations,
// so we narrow to the fields we read structurally.
interface DevReq {
  url?: string;
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  socket: { encrypted?: boolean };
}

/**
 * Dev SSR middleware: ssrLoadModule the entry, run its Hono app's fetch, pipe
 * the Response back, and inject Vite's HMR client into HTML.
 */
export function devMiddleware(
  server: ViteDevServer,
  entry: string,
): Connect.NextHandleFunction {
  return async (rawReq, res, next) => {
    const req = rawReq as unknown as DevReq;
    const url = req.url ?? "/";
    if (VITE_OWNED.some((re) => re.test(url))) return next();

    let app: { fetch: (r: Request) => Response | Promise<Response> };
    try {
      const mod = await server.ssrLoadModule(entry);
      app = (mod.default ?? mod.app) as typeof app;
      if (typeof app?.fetch !== "function") {
        throw new Error(`${entry} has no default/app export with a fetch()`);
      }
    } catch (e) {
      if (e instanceof Error) server.ssrFixStacktrace(e);
      return next(e);
    }

    try {
      const proto = req.socket.encrypted ? "https" : "http";
      const request = new Request(
        new URL(url, `${proto}://${req.headers.host ?? "localhost"}`),
        {
          method: req.method,
          headers: req.headers as HeadersInit,
          // GET/HEAD have no body; anything else streams the Node req in.
          body: req.method === "GET" || req.method === "HEAD"
            ? undefined
            : (req as unknown as ReadableStream),
          // @ts-ignore duplex is required by undici for a streaming body.
          duplex: "half",
        },
      );
      const response = await app.fetch(request);
      res.statusCode = response.status;
      const isHtml = /^text\/html/.test(
        response.headers.get("content-type") ?? "",
      );
      response.headers.forEach((v, k) => {
        // content-length is recomputed after we inject the HMR client below.
        if (isHtml && k === "content-length") return;
        res.setHeader(k, v);
      });
      if (isHtml) {
        // Inject Vite's HMR client by string, not transformIndexHtml — the
        // latter rewrites our inline island-boot <script> into an asset proxy.
        const body = (await response.text()).replace(
          "<head>",
          `<head>${DEV_HEAD_INJECT}`,
        );
        res.setHeader(
          "content-length",
          String(new TextEncoder().encode(body).length),
        );
        res.end(body);
      } else {
        res.end(response.body ? await response.text() : undefined);
      }
    } catch (e) {
      next(e);
    }
  };
}
