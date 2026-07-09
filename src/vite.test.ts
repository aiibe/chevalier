import { assertEquals } from "@std/assert";
import { chevalier } from "./vite.ts";
import { chevalierConfig } from "./vite-config.ts";
import { generateApp } from "./vite/virtual.ts";
import { islandPrefresh } from "./vite/prefresh.ts";

// deno-lint-ignore no-explicit-any
type AnyPlugin = any;

/** The chevalier core plugin from the returned single-element array. */
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

Deno.test("hot-reload — _app shell edit broadcasts to all clients", () => {
  const { p, server, broadcast, mkClient, report } = fakeServer();
  const onAbout = mkClient();
  report(onAbout, "/about");
  const r = p.handleHotUpdate({
    file: "/proj/app/routes/_app.tsx",
    server,
  });
  assertEquals(r, []);
  assertEquals(broadcast, [{ type: "full-reload" }], "_app broadcasts");
  assertEquals(onAbout.sent, [], "_app uses broadcast, not per-client send");
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
  Deno.writeTextFileSync(`${dir}/app/routes/_app.tsx`, page);
  Deno.writeTextFileSync(`${dir}/app/routes/_404.tsx`, page);

  const code = generateApp("app", dir, {
    islands: "virtual:chevalier-islands",
    manifest: "virtual:chevalier-manifest",
  });

  // Glob rooted at appRoot, with the _* exclusion pattern.
  assertEquals(code.includes("/app/routes/**/*.{tsx,jsx,ts}"), true);
  assertEquals(code.includes("!/app/routes/**/_*"), true);
  // Separate middleware + layout globs, since the routes glob excludes _* files.
  assertEquals(
    code.includes("/app/routes/**/_middleware.{ts,tsx,js,jsx}"),
    true,
  );
  assertEquals(code.includes("middleware:"), true);
  // _layout is per-directory (nearest wins), so it's a glob, not a static import.
  assertEquals(code.includes("/app/routes/**/_layout.{tsx,jsx}"), true);
  assertEquals(code.includes("layouts:"), true);
  assertEquals(code.includes(`import layout from`), false);
  // Present single-instance pages imported + wired; absent ones omitted.
  assertEquals(
    code.includes(`import notFound from "/app/routes/_404.tsx"`),
    true,
  );
  // _app is a single-instance convention page (app-root only), like _404.
  assertEquals(code.includes(`import app from "/app/routes/_app.tsx"`), true);
  assertEquals(code.includes("_error"), false);
  assertEquals(code.includes("export default defineApp("), true);

  Deno.removeSync(dir, { recursive: true });
});

// Client build inputs: islands + client entry + the styles entry core owns
// (absorbed from the old scaffold plugin; keyed so styleUrl resolves it).
Deno.test("config — client build registers island, client, and styles inputs", () => {
  const dir = Deno.makeTempDirSync();
  Deno.mkdirSync(`${dir}/app/islands`, { recursive: true });
  Deno.writeTextFileSync(
    `${dir}/app/islands/counter.tsx`,
    "export default () => null;",
  );

  const plugins = chevalier({ appRoot: "./app" }) as AnyPlugin[];
  const core = plugins.find((p) => p.name === "chevalier");
  const config: AnyPlugin = { root: dir };
  core.config(config, { command: "build", isSsrBuild: false });

  const input = config.build.rollupOptions.input as Record<string, string>;
  // Manifest key is "app/styles.css" (leading slash normalized away), matching
  // defineApp's default styles so styleUrl finds the hashed asset.
  assertEquals(input.styles, "/app/styles.css");
  assertEquals(input["islands/counter"], "app/islands/counter.tsx");
  assertEquals(input["chevalier-client"], "chevalier:client");

  Deno.removeSync(dir, { recursive: true });
});

// appRoot moves the styles input key too, so a relocated app dir still resolves.
Deno.test("config — styles input follows a custom appRoot", () => {
  const dir = Deno.makeTempDirSync();
  Deno.mkdirSync(`${dir}/src/islands`, { recursive: true });

  const plugins = chevalier({ appRoot: "./src" }) as AnyPlugin[];
  const core = plugins.find((p) => p.name === "chevalier");
  const config: AnyPlugin = { root: dir };
  core.config(config, { command: "build", isSsrBuild: false });

  const input = config.build.rollupOptions.input as Record<string, string>;
  assertEquals(input.styles, "/src/styles.css");

  Deno.removeSync(dir, { recursive: true });
});

// SSR build inputs the generated app, not styles/islands (client-only concerns).
Deno.test("config — SSR build does not register the styles input", () => {
  const plugins = chevalier({ appRoot: "./app" }) as AnyPlugin[];
  const core = plugins.find((p) => p.name === "chevalier");
  const config: AnyPlugin = { root: Deno.cwd() };
  core.config(config, { command: "build", isSsrBuild: true });

  const input = config.build.rollupOptions.input as Record<string, string>;
  assertEquals("styles" in input, false);
  assertEquals(input.server, "virtual:chevalier-app");
});

// chevalier() is just the core plugin now; island HMR is prefresh's own plugins,
// wired separately in chevalierConfig (see islandPrefresh tests below).
Deno.test("chevalier returns the core plugin", () => {
  const plugins = chevalier({ appRoot: "./app" }) as AnyPlugin[];
  assertEquals(Array.isArray(plugins), true);
  assertEquals(plugins.map((p) => p.name), ["chevalier"]);
});

// Core owns Tailwind, so the scaffold config is defineConfig(chevalierConfig()).
Deno.test("chevalierConfig bundles chevalier, tailwind, and deno plugins", async () => {
  const config = await chevalierConfig()({ isSsrBuild: false });
  const names = (config.plugins as AnyPlugin[]).flat()
    .map((p) => p && p.name).filter(Boolean) as string[];
  assertEquals(names.includes("chevalier"), true);
  assertEquals(names.some((n) => n.startsWith("@tailwindcss/vite")), true);
  assertEquals(names.some((n) => n === "deno" || n.startsWith("deno:")), true);
});

// Absent @prefresh/vite → a serve-only warning stub; its buildStart warns once
// (not per module) so the silent state-loss degrade is discoverable.
Deno.test("prefresh — warning stub warns once when @prefresh/vite is absent", async () => {
  const plugins = await islandPrefresh(() =>
    Promise.resolve(null)
  ) as AnyPlugin[];
  assertEquals(plugins.length, 1);
  const stub = plugins[0];
  assertEquals(stub.name, "chevalier:prefresh-missing");
  assertEquals(stub.apply, "serve", "no warning / no work in build");

  const warnings: string[] = [];
  const ctx = { warn: (m: string) => warnings.push(m) };
  stub.buildStart.call(ctx);
  stub.buildStart.call(ctx);
  assertEquals(warnings.length, 1, "warns once, not per build");
  assertEquals(warnings[0].includes("@prefresh/vite"), true);
});

// Present @prefresh/vite → its plugin array is registered as-is, scoped to
// islands via the include filter we pass the factory.
Deno.test("prefresh — registers the factory's plugins scoped to islands", async () => {
  let gotOpts: AnyPlugin;
  const fakeFactory = (opts: AnyPlugin) => {
    gotOpts = opts;
    return Promise.resolve([
      { name: "prefresh-preact-options" },
      { name: "prefresh-babel-transform" },
      { name: "prefresh-wrapper" },
    ]);
  };
  const plugins = await islandPrefresh(() =>
    Promise.resolve(fakeFactory as AnyPlugin)
  ) as AnyPlugin[];

  assertEquals(
    plugins.map((p) => p.name),
    ["prefresh-preact-options", "prefresh-babel-transform", "prefresh-wrapper"],
  );
  // Scoped to islands/*.tsx|jsx (any depth); routes are server-owned reloads.
  assertEquals(gotOpts.include.test("/proj/app/islands/counter.tsx"), true);
  assertEquals(gotOpts.include.test("/proj/app/islands/nested/w.jsx"), true);
  assertEquals(gotOpts.include.test("/proj/app/routes/about.tsx"), false);
});
