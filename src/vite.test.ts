import { assertEquals } from "@std/assert";
import { chevalier } from "./vite.ts";
import { generateApp } from "./vite/virtual.ts";
import { scopedPrefresh } from "./vite/prefresh.ts";

// deno-lint-ignore no-explicit-any
type AnyPlugin = any;

/** The chevalier core plugin out of the returned [core, prefresh] array. */
function corePlugin(): AnyPlugin {
  const plugins = chevalier({ appRoot: "./app" }) as AnyPlugin[];
  const core = plugins.find((p) => p.name === "chevalier");
  if (!core) throw new Error("chevalier core plugin not found");
  return core;
}

// A fake HMR client that records what the server sends it, plus a captured
// custom-event listener so a test can feed the client its location.pathname.
function fakeServer() {
  const broadcast: unknown[] = []; // server.ws.send(...) — reaches all clients
  const listeners: Record<string, (data: unknown, client: object) => void> = {};
  const clients = new Set<{ sent: unknown[]; send: (m: unknown) => void }>();
  const mkClient = () => {
    const c = { sent: [] as unknown[], send: (m: unknown) => c.sent.push(m) };
    clients.add(c);
    return c;
  };
  const server = {
    ws: {
      send: (m: unknown) => broadcast.push(m),
      clients,
      on: (
        e: string,
        cb: (d: unknown, c: object) => void,
      ) => (listeners[e] = cb),
    },
    watcher: { on: () => {} },
    middlewares: { use: () => {} },
    environments: { ssr: { moduleGraph: undefined } },
  };
  // Drive configureServer so the "chevalier:route" listener registers.
  const p = corePlugin();
  p.configureServer(server);
  const report = (client: object, pathname: string) =>
    listeners["chevalier:route"]?.({ pathname }, client);
  return { p, server, broadcast, mkClient, report };
}

// Route edits reload only browsers on that route; layout edits reload all;
// islands fall through to prefresh HMR (undefined → default handling).
Deno.test("hot-reload — route edit targets only matching clients", () => {
  const { p, server, mkClient, report } = fakeServer();
  const onIndex = mkClient(), onAbout = mkClient(), onBlogPost = mkClient();
  report(onIndex, "/");
  report(onAbout, "/about");
  report(onBlogPost, "/blog/hello");

  // Editing routes/about.tsx reloads only the /about tab.
  const r = p.handleHotUpdate({
    file: "/proj/app/routes/about.tsx",
    server,
  });
  assertEquals(r, [], "route edit swallows HMR");
  assertEquals(onAbout.sent, [{ type: "full-reload" }]);
  assertEquals(onIndex.sent, [], "index tab must not reload");
  assertEquals(onBlogPost.sent, [], "blog tab must not reload");
});

Deno.test("hot-reload — dynamic route matches its concrete URL", () => {
  const { p, server, mkClient, report } = fakeServer();
  const onPost = mkClient(), onIndex = mkClient();
  report(onPost, "/blog/hello");
  report(onIndex, "/");

  p.handleHotUpdate({ file: "/proj/app/routes/blog/[slug].tsx", server });
  assertEquals(onPost.sent, [{ type: "full-reload" }]);
  assertEquals(onIndex.sent, []);
});

Deno.test("hot-reload — client with no reported path reloads (safe default)", () => {
  const { p, server, mkClient } = fakeServer();
  const unknown = mkClient(); // never reported a pathname
  p.handleHotUpdate({ file: "/proj/app/routes/about.tsx", server });
  assertEquals(unknown.sent, [{ type: "full-reload" }]);
});

Deno.test("hot-reload — layout edit broadcasts to all clients", () => {
  const { p, server, broadcast, mkClient, report } = fakeServer();
  const onAbout = mkClient();
  report(onAbout, "/about");
  const r = p.handleHotUpdate({
    file: "/proj/app/routes/_layout.tsx",
    server,
  });
  assertEquals(r, []);
  assertEquals(broadcast, [{ type: "full-reload" }], "layout broadcasts");
  assertEquals(onAbout.sent, [], "layout uses broadcast, not per-client send");
});

Deno.test("hot-reload — middleware edit broadcasts to all clients", () => {
  const { p, server, broadcast, mkClient, report } = fakeServer();
  const onAbout = mkClient();
  report(onAbout, "/about");
  const r = p.handleHotUpdate({
    file: "/proj/app/routes/admin/_middleware.ts",
    server,
  });
  assertEquals(r, []);
  assertEquals(broadcast, [{ type: "full-reload" }], "middleware broadcasts");
  assertEquals(
    onAbout.sent,
    [],
    "middleware uses broadcast, not per-client send",
  );
});

Deno.test("hot-reload — islands and non-app files don't full-reload", () => {
  const { p, server, broadcast, mkClient, report } = fakeServer();
  const onIndex = mkClient();
  report(onIndex, "/");

  for (
    const f of [
      "/proj/app/islands/counter.tsx",
      "/proj/app/islands/nested/widget.tsx",
      "/proj/vite.config.ts",
    ]
  ) {
    const r = p.handleHotUpdate({ file: f, server });
    assertEquals(r, undefined, `should not swallow: ${f}`);
  }
  assertEquals(broadcast, []);
  assertEquals(onIndex.sent, []);
});

// Island imports carry the extension + HMR `?t=` suffix but the map is keyed
// extensionless. Regression: `.tsx` keys 500'd in dev.
Deno.test("resolveId — island alias resolves with/without ext and ?t suffix", () => {
  const dir = Deno.makeTempDirSync();
  Deno.mkdirSync(`${dir}/app/islands`, { recursive: true });
  Deno.writeTextFileSync(
    `${dir}/app/islands/panel.tsx`,
    "export default () => null;",
  );

  const p = corePlugin();
  p.configResolved({ root: dir });

  const expected = `${dir}/app/islands/panel.tsx`;
  assertEquals(p.resolveId("chevalier-island:islands/panel"), expected);
  assertEquals(p.resolveId("chevalier-island:islands/panel.tsx"), expected);
  assertEquals(
    p.resolveId("chevalier-island:islands/panel.tsx?t=123"),
    expected,
  );
  // A miss must throw here, not fall through to Deno's loader.
  // Regression: deleting an island while a stale importer lingered.
  let threw = false;
  try {
    p.resolveId("chevalier-island:islands/missing");
  } catch (e) {
    threw = true;
    assertEquals((e as Error).message.includes("islands/missing"), true);
  }
  assertEquals(threw, true, "missing island alias should throw");

  Deno.removeSync(dir, { recursive: true });
});

// generateApp emits the whole SSR app: a defineApp call with the routes glob
// (rooted at appRoot, _* excluded) and only the convention pages present on
// disk. Here _layout + _404 exist, _error doesn't.
Deno.test("generateApp emits a defineApp app with discovered pages", () => {
  const dir = Deno.makeTempDirSync();
  Deno.mkdirSync(`${dir}/app/routes`, { recursive: true });
  const page = "export default () => null;";
  Deno.writeTextFileSync(`${dir}/app/routes/_layout.tsx`, page);
  Deno.writeTextFileSync(`${dir}/app/routes/_404.tsx`, page);

  const code = generateApp("app", dir, {
    islands: "virtual:chevalier-islands",
    manifest: "virtual:chevalier-manifest",
  });

  // Glob rooted at appRoot, with the _* exclusion pattern.
  assertEquals(code.includes("/app/routes/**/*.{tsx,jsx,ts}"), true);
  assertEquals(code.includes("!/app/routes/**/_*"), true);
  // A separate middleware glob, since the routes glob excludes _* files.
  assertEquals(
    code.includes("/app/routes/**/_middleware.{ts,tsx,js,jsx}"),
    true,
  );
  assertEquals(code.includes("middleware:"), true);
  // Present pages imported + wired; absent ones omitted.
  assertEquals(
    code.includes(`import layout from "/app/routes/_layout.tsx"`),
    true,
  );
  assertEquals(
    code.includes(`import notFound from "/app/routes/_404.tsx"`),
    true,
  );
  assertEquals(code.includes("_error"), false);
  assertEquals(code.includes("export default defineApp("), true);

  Deno.removeSync(dir, { recursive: true });
});

// The plugin returns [core, prefresh]; both must be present so islands HMR.
Deno.test("chevalier returns core + scoped prefresh plugins", () => {
  const plugins = chevalier({ appRoot: "./app" }) as AnyPlugin[];
  assertEquals(Array.isArray(plugins), true);
  const names = plugins.map((p) => p.name);
  assertEquals(names.includes("chevalier"), true);
  assertEquals(names.includes("chevalier:prefresh"), true);
});

// Serve-mode transform harness with a fake plugin ctx capturing this.warn().
function runPrefreshTransform(loadTransform: () => Promise<AnyPlugin>) {
  const warnings: string[] = [];
  const p = scopedPrefresh(
    "app",
    () => true,
    loadTransform,
  ) as AnyPlugin;
  const ctx = { warn: (m: string) => warnings.push(m) };
  const call = (id: string) =>
    p.transform.call(ctx, "code", id, { ssr: false });
  return { call, warnings };
}

Deno.test("prefresh — warns once when @prefresh/vite is absent", async () => {
  const { call, warnings } = runPrefreshTransform(() => Promise.resolve(null));
  const out1 = await call("/proj/app/islands/counter.tsx");
  const out2 = await call("/proj/app/islands/widget.tsx");

  assertEquals(out1, undefined, "no transform without prefresh");
  assertEquals(out2, undefined);
  assertEquals(warnings.length, 1, "warns once, not per island");
  assertEquals(warnings[0].includes("@prefresh/vite"), true);
});

// Non-island and SSR passes bail before the loader runs, so no warning fires.
Deno.test("prefresh — no warning for non-island or SSR transforms", async () => {
  const warnings: string[] = [];
  const p = scopedPrefresh(
    "app",
    () => true,
    () => Promise.resolve(null),
  ) as AnyPlugin;
  const ctx = { warn: (m: string) => warnings.push(m) };
  await p.transform.call(ctx, "code", "/proj/app/routes/about.tsx", {
    ssr: false,
  }); // not an island
  await p.transform.call(ctx, "code", "/proj/app/islands/counter.tsx", {
    ssr: true,
  }); // island, but SSR pass
  assertEquals(warnings.length, 0);
});

Deno.test("prefresh — runs transform when @prefresh/vite is present", async () => {
  let called = false;
  const fakeTransform = () => {
    called = true;
    return { code: "transformed" };
  };
  const { call, warnings } = runPrefreshTransform(() =>
    Promise.resolve(fakeTransform as AnyPlugin)
  );
  const out = await call("/proj/app/islands/counter.tsx");
  assertEquals(called, true);
  assertEquals(out, { code: "transformed" });
  assertEquals(warnings.length, 0);
});
