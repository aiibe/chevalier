// Smoke test for @chevalier/init: scaffold a fresh app and assert `deno task dev`
// serves SSR + island + /api and `deno task build` emits client + SSR output.
//
// Two modes:
//   default        Repoint the scaffold's import map at the local core (src/), so
//                  CI validates the code in the PR without depending on a publish.
//   SMOKE_JSR=1    Leave the jsr:@chevalier/core pin intact — verifies the
//                  scaffold works against the *published* package (incl. its
//                  ./client and ./registry sub-path exports). Only passes once
//                  the pinned version is on JSR; run post-publish.
//
// Run: deno run -A init/scripts/smoke.ts   (or SMOKE_JSR=1 deno run -A ...)
// Repo-root-relative resolution so it works from any cwd (CI runs from root).

const USE_JSR = Deno.env.get("SMOKE_JSR") === "1";
const REPO_ROOT = new URL("../../", import.meta.url).pathname.replace(
  /\/$/,
  "",
);
const INIT_MOD = `${REPO_ROOT}/init/mod.ts`;
const CORE_SRC = `${REPO_ROOT}/src`;
const PORT = 5199;
const PROD_PORT = 5198;
const BASE = `http://127.0.0.1:${PORT}`;
const PROD_BASE = `http://127.0.0.1:${PROD_PORT}`;

let failed = false;
const fail = (msg: string) => {
  failed = true;
  console.error(`FAIL: ${msg}`);
};
const ok = (msg: string) => console.log(`ok: ${msg}`);

// Returns null on a non-JSON body (e.g. a broken app's HTML error page) instead
// of throwing, so callers report a FAIL rather than aborting the whole run.
const fetchJson = async (url: string, init?: RequestInit) => {
  const res = await fetch(url, init);
  const body = await res.text();
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
};

console.log(`mode: ${USE_JSR ? "published JSR core" : "local src core"}`);

const workRoot = await Deno.makeTempDir({ prefix: "chevalier-smoke-" });
const APP = `${workRoot}/smoke-app`;

// Own cache dir so subprocesses can't inherit the repo's deno.lock and pin a
// stale jsr:@chevalier/init resolution into it.
const DENO_DIR = `${workRoot}/deno-cache`;

async function run(
  cmd: string[],
  opts: { cwd?: string; env?: Record<string, string> } = {},
): Promise<Deno.CommandOutput> {
  const [bin, ...args] = cmd;
  return await new Deno.Command(bin, {
    args,
    cwd: opts.cwd,
    env: { ...Deno.env.toObject(), DENO_DIR, ...opts.env },
    stdout: "piped",
    stderr: "piped",
  }).output();
}

const dec = new TextDecoder();

try {
  // 1. Scaffold. --no-lock: pure file writes, and it stops a repo-tree run from
  // touching a lockfile.
  const scaffold = await run(
    ["deno", "run", "-A", "--no-lock", INIT_MOD, "smoke-app"],
    { cwd: workRoot },
  );
  if (!scaffold.success) {
    console.error(dec.decode(scaffold.stderr));
    fail("scaffolder exited non-zero");
    throw new Error("scaffold failed");
  }
  ok("scaffolded app");

  // 2. Point the scaffold at a resolvable core.
  const denoJsonPath = `${APP}/deno.json`;
  if (USE_JSR) {
    // Leave the jsr: pin intact; assert every sub-path export resolves against
    // the *published* package (catches a template referencing an export the
    // published version doesn't have, e.g. "Unknown export './client'").
    // Disable the minimum-dependency-age guard: runs right after a publish, so
    // the pinned version is newer than Deno's default cutoff and gets rejected.
    const cfg = JSON.parse(await Deno.readTextFile(denoJsonPath));
    cfg.minimumDependencyAge = 0;
    await Deno.writeTextFile(denoJsonPath, JSON.stringify(cfg, null, 2) + "\n");
    const map = cfg.imports as Record<string, string>;
    // Derive the subpaths from the template's own chevalier* pins so this can't
    // drift when an export is added to or trimmed from the import map.
    const specs = Object.keys(map).filter((k) =>
      k === "chevalier" || k.startsWith("chevalier/")
    );
    for (const spec of specs) {
      // Explicit try/catch + Deno.exit: `deno eval` exits 0 even on an uncaught
      // top-level import rejection, so a bare `await import(...)` false-passes.
      // cwd: APP so the app's deno.json (only the jsr: pin) governs resolution;
      // from the repo root, the workspace deno.json shadows it with local src/.
      const check = await run([
        "deno",
        "eval",
        "--minimum-dependency-age=0",
        `try { await import(${JSON.stringify(map[spec])}); }` +
        ` catch (e) { console.error(String(e)); Deno.exit(1); }`,
      ], { cwd: APP });
      if (!check.success) {
        console.error(dec.decode(check.stderr));
        fail(`published core does not resolve "${spec}" (${map[spec]})`);
        throw new Error("jsr export check failed");
      }
    }
    ok("published core resolves all export subpaths");
  } else {
    // Repoint the import map at local core so CI tests the PR without a publish.
    // Only specifiers the template declares belong here — core reaches
    // ./registry.tsx transitively via relative paths, so it needs no repoint.
    const REPOINTS: ReadonlyArray<readonly [string, string]> = [
      ["chevalier", `${CORE_SRC}/mod.ts`],
      ["chevalier/client", `${CORE_SRC}/client.ts`],
      ["chevalier/static", `${CORE_SRC}/static.ts`],
      ["chevalier/vite", `${CORE_SRC}/vite-config.ts`],
    ];
    let denoJson = await Deno.readTextFile(denoJsonPath);
    for (const [spec, local] of REPOINTS) {
      // Assert per specifier: a whole-file diff can't catch one key going stale.
      const re = new RegExp(`"${spec.replace("/", "\\/")}":\\s*"[^"]*"`);
      const next = denoJson.replace(re, `"${spec}": "${local}"`);
      if (next === denoJson) {
        fail(`import-map repoint missed "${spec}" — template shape changed`);
        throw new Error("repoint failed");
      }
      denoJson = next;
    }
    await Deno.writeTextFile(denoJsonPath, denoJson);
    ok("repointed core to local src");
  }

  // 3. Must run before the build: a check task reaching server.prod.ts (and so
  // the not-yet-built bundle) only fails while dist/ is absent.
  const checkFresh = await run(["deno", "task", "check"], { cwd: APP });
  if (!checkFresh.success) {
    console.error(dec.decode(checkFresh.stderr));
    fail("deno task check failed on a fresh scaffold (before build)");
  } else ok("deno task check passes before build");

  // 4. Dev server: boot, then assert SSR + island + handler responses.
  // `deno task dev` runs `vite`; extra args after it reach vite (--port, --host).
  const dev = new Deno.Command("deno", {
    args: ["task", "dev", "--port", String(PORT), "--host", "127.0.0.1"],
    cwd: APP,
    env: { ...Deno.env.toObject(), DENO_DIR },
    stdout: "piped",
    stderr: "piped",
  }).spawn();

  // Drain the dev server's output so we can print it if boot fails; otherwise a
  // crashed server just reads as "never became reachable" with no cause.
  const decoder = new TextDecoder();
  let devLog = "";
  const capture = (stream: ReadableStream<Uint8Array>) =>
    (async () => {
      for await (const chunk of stream) devLog += decoder.decode(chunk);
    })();
  const draining = Promise.all([capture(dev.stdout), capture(dev.stderr)]);

  try {
    // Wait for readiness by polling the port, not by scraping log lines.
    let ready = false;
    for (let i = 0; i < 120; i++) {
      try {
        const r = await fetch(BASE, { signal: AbortSignal.timeout(1000) });
        await r.body?.cancel();
        ready = true;
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    if (!ready) {
      fail("dev server never became reachable");
      console.error("--- dev server output ---");
      console.error(devLog || "(no output captured)");
      console.error("--- end dev server output ---");
    } else {
      ok("dev server up");

      const home = await (await fetch(BASE)).text();
      if (!home.includes(">Chevalier</h1>")) fail("/ missing SSR heading");
      else ok("/ SSR renders");
      // Dev: render-blocking ?direct <link> (no FOUC) + a <script> for CSS HMR.
      if (
        !home.includes('<link rel="stylesheet" href="/app/styles.css?direct"')
      ) {
        fail("/ missing dev stylesheet link (?direct)");
      } else if (
        !home.includes('<script type="module" src="/app/styles.css">')
      ) {
        fail("/ missing dev stylesheet HMR script");
      } else ok("/ dev stylesheet wired");
      if (!home.includes("counts: 3")) fail("/ island not SSR'd (counts: 3)");
      else ok("/ island SSR'd");
      if (!home.includes("hydrateIslands")) {
        fail("/ missing island boot script");
      } else ok("/ island boot script present");

      // A broken app serves an HTML error page here; .json() would throw and
      // abort the run before cleanup. Parse defensively so it reads as a FAIL.
      const api = await fetchJson(`${BASE}/api`);
      if (api?.ok !== true) fail("/api did not return { ok: true }");
      else ok("/api handler responds");

      const echo = await fetchJson(`${BASE}/api/echo`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hi: 1 }),
      });
      if (echo?.echo?.hi !== 1) fail("POST /api/echo did not echo body");
      else ok("POST /api/echo echoes");

      const aboutRes = await fetch(`${BASE}/about`);
      const about = await aboutRes.text();
      if (aboutRes.status !== 200) fail("/about not 200");
      else if (!about.includes(">About</h1>")) {
        fail("/about missing heading");
      } else ok("/about renders");

      const guestbook = await (await fetch(`${BASE}/guestbook`)).text();
      if (!guestbook.includes("Islands all the way down.")) {
        fail("/guestbook loader did not render seeded entry");
      } else ok("/guestbook loader renders entries");

      // POST an entry → action writes then 303-redirects (PRG).
      const signRes = await fetch(`${BASE}/guestbook`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ message: "smoke-test-was-here" }),
        redirect: "manual",
      });
      await signRes.body?.cancel();
      if (signRes.status !== 303) {
        fail(`/guestbook POST not a 303 redirect (${signRes.status})`);
      } else ok("/guestbook POST → 303 redirect");

      // Re-GET reflects the new entry the action wrote.
      const after = await (await fetch(`${BASE}/guestbook`)).text();
      if (!after.includes("smoke-test-was-here")) {
        fail("/guestbook did not persist posted entry");
      } else ok("/guestbook shows posted entry after redirect");

      // Guarded /admin with no session → _middleware redirects to /login.
      const guarded = await fetch(`${BASE}/admin`, { redirect: "manual" });
      await guarded.body?.cancel();
      if (
        guarded.status !== 302 ||
        !guarded.headers.get("location")?.endsWith("/login")
      ) {
        fail(
          `/admin (no session) did not redirect to /login (${guarded.status})`,
        );
      } else ok("/admin (no session) → redirect to /login");

      // POST /login sets a session cookie, then 303s into the guarded area.
      const signIn = await fetch(`${BASE}/login`, {
        method: "POST",
        redirect: "manual",
      });
      await signIn.body?.cancel();
      const cookie = signIn.headers.get("set-cookie")?.split(";")[0];
      if (
        signIn.status !== 303 ||
        !signIn.headers.get("location")?.endsWith("/admin")
      ) {
        fail(`POST /login not a 303 to /admin (${signIn.status})`);
      } else if (!cookie) {
        fail("POST /login set no session cookie");
      } else ok("POST /login → 303 to /admin + session cookie");

      // Re-GET /admin carrying the cookie → guard passes, page renders.
      const admin = cookie
        ? await fetch(`${BASE}/admin`, { headers: { cookie } })
        : undefined;
      const adminBody = admin ? await admin.text() : "";
      if (admin?.status !== 200) {
        fail(`/admin (with session) not 200 (${admin?.status})`);
      } else if (!adminBody.includes(">Admin</h1>")) {
        fail("/admin (with session) missing heading");
      } else ok("/admin (with session) renders");

      const notFound = await fetch(`${BASE}/does-not-exist`);
      await notFound.body?.cancel();
      if (notFound.status !== 404) {
        fail(`unmatched route not 404 (${notFound.status})`);
      } else ok("unmatched route → 404");
    }
  } finally {
    try {
      dev.kill("SIGTERM");
    } catch { /* already terminated */ }
    try {
      await dev.status;
    } catch { /* already gone */ }
    await draining.catch(() => {});
  }

  // 5. Build: client + SSR output must exist.
  const build = await run(["deno", "task", "build"], { cwd: APP });
  if (!build.success) {
    console.error(dec.decode(build.stderr));
    fail("deno task build exited non-zero");
  } else {
    ok("build succeeded");
    const exists = async (p: string) => {
      try {
        await Deno.stat(p);
        return true;
      } catch {
        return false;
      }
    };
    if (!(await exists(`${APP}/dist/server/server.mjs`))) {
      fail("build produced no dist/server/server.mjs");
    } else ok("SSR build output present");
    if (!(await exists(`${APP}/dist/client/.vite/manifest.json`))) {
      fail("build produced no client manifest");
    } else ok("client manifest present");

    // 6. `exclude` prunes check's roots, not its module graph, so dist never
    // appears in the output — corrupting the bundle is the only reliable probe.
    const bundle = `${APP}/dist/server/server.mjs`;
    const realBundle = await Deno.readTextFile(bundle);
    await Deno.writeTextFile(bundle, "this is not (valid javascript;\n");
    const checkBuilt = await run(["deno", "task", "check"], { cwd: APP });
    await Deno.writeTextFile(bundle, realBundle);
    if (!checkBuilt.success) {
      console.error(dec.decode(checkBuilt.stderr));
      fail(
        "deno task check reached dist/ (built bundle pulled into the graph)",
      );
    } else ok("deno task check stays out of dist/ after build");

    // `check` can't reach server.prod.ts, so a real build is its only coverage.
    const checkProd = await run(["deno", "check", "server.prod.ts"], {
      cwd: APP,
    });
    if (!checkProd.success) {
      console.error(dec.decode(checkProd.stderr));
      fail("deno check server.prod.ts failed after build");
    } else ok("server.prod.ts type-checks against the build");

    // 7. Production server: server.prod.ts must serve /assets/ with immutable
    // cache headers, honor If-None-Match, reject non-GET/HEAD + traversal, serve
    // public/ files (favicon) revalidated from the root, and fall through to the
    // app for page routes.
    if (build.success) {
      // Pick a real content-hashed chunk to request.
      let asset: string | undefined;
      try {
        for await (const e of Deno.readDir(`${APP}/dist/client/assets`)) {
          if (e.isFile && e.name.endsWith(".js")) {
            asset = `/assets/${e.name}`;
            break;
          }
        }
      } catch { /* no assets dir → asset stays undefined, reported below */ }

      const prod = new Deno.Command("deno", {
        args: [
          "serve",
          "-A",
          "--port",
          String(PROD_PORT),
          "--host",
          "127.0.0.1",
          "server.prod.ts",
        ],
        cwd: APP,
        env: { ...Deno.env.toObject(), DENO_DIR },
        stdout: "piped",
        stderr: "piped",
      }).spawn();

      const prodDecoder = new TextDecoder();
      let prodLog = "";
      const captureProd = (stream: ReadableStream<Uint8Array>) =>
        (async () => {
          for await (const chunk of stream) {
            prodLog += prodDecoder.decode(chunk);
          }
        })();
      const drainingProd = Promise.all([
        captureProd(prod.stdout),
        captureProd(prod.stderr),
      ]);

      try {
        let prodReady = false;
        for (let i = 0; i < 60; i++) {
          try {
            const r = await fetch(PROD_BASE, {
              signal: AbortSignal.timeout(1000),
            });
            await r.body?.cancel();
            prodReady = true;
            break;
          } catch {
            await new Promise((r) => setTimeout(r, 500));
          }
        }
        if (!prodReady) {
          fail("prod server never became reachable");
          console.error("--- prod server output ---");
          console.error(prodLog || "(no output captured)");
          console.error("--- end prod server output ---");
        } else {
          ok("prod server up");

          // Page route: falls through to app.fetch and renders SSR.
          const home = await (await fetch(PROD_BASE)).text();
          if (!home.includes(">Chevalier</h1>")) {
            fail("prod / missing SSR heading (fall-through broken)");
          } else ok("prod / renders (fall-through)");

          // Build: Tailwind entry is linked as a hashed .css and serves as CSS.
          const cssHref = home.match(/\/assets\/styles-[^"]+\.css/)?.[0];
          if (!cssHref) {
            fail("prod / missing hashed stylesheet <link>");
          } else {
            const cssRes = await fetch(`${PROD_BASE}${cssHref}`);
            await cssRes.body?.cancel();
            if (cssRes.status !== 200) {
              fail(`GET ${cssHref} not 200 (${cssRes.status})`);
            } else if (!cssRes.headers.get("content-type")?.includes("css")) {
              fail(`GET ${cssHref} wrong Content-Type`);
            } else ok("prod stylesheet served as CSS");
          }

          if (!asset) {
            fail("no hashed chunk found under dist/client/assets");
          } else {
            const a = await fetch(`${PROD_BASE}${asset}`);
            await a.body?.cancel();
            const cc = a.headers.get("cache-control");
            const etag = a.headers.get("etag");
            if (a.status !== 200) {
              fail(`GET ${asset} not 200 (${a.status})`);
            } else if (cc !== "public, max-age=31536000, immutable") {
              fail(`GET ${asset} missing immutable Cache-Control (${cc})`);
            } else if (!a.headers.get("content-type")?.includes("javascript")) {
              fail(`GET ${asset} wrong Content-Type`);
            } else ok("GET /assets/<chunk> → 200 immutable");

            // If-None-Match → 304, still tagged immutable.
            if (etag) {
              const nm = await fetch(`${PROD_BASE}${asset}`, {
                headers: { "if-none-match": etag },
              });
              await nm.body?.cancel();
              if (nm.status !== 304) {
                fail(`If-None-Match ${asset} not 304 (${nm.status})`);
              } else if (
                nm.headers.get("cache-control") !==
                  "public, max-age=31536000, immutable"
              ) {
                fail("304 response missing immutable Cache-Control");
              } else ok("If-None-Match → 304 immutable");
            } else fail(`GET ${asset} returned no ETag`);

            // Non-GET/HEAD → 405 (serveDir rejects the method).
            const post = await fetch(`${PROD_BASE}${asset}`, {
              method: "POST",
            });
            await post.body?.cancel();
            if (post.status !== 405) {
              fail(`POST ${asset} not 405 (${post.status})`);
            } else ok("POST /assets/<chunk> → 405");
          }

          // Traversal must not escape the assets root.
          const trav = await fetch(`${PROD_BASE}/assets/../server.prod.ts`);
          await trav.body?.cancel();
          if (trav.status === 200) {
            fail("traversal /assets/../server.prod.ts served a file (200)");
          } else ok("traversal blocked");

          // public/ file: served from root with a stable name, so it must
          // revalidate (no-cache), not pin immutable like hashed /assets/.
          const fav = await fetch(`${PROD_BASE}/favicon.png`);
          await fav.body?.cancel();
          const favCc = fav.headers.get("cache-control");
          if (fav.status !== 200) {
            fail(`GET /favicon.png not 200 (${fav.status})`);
          } else if (favCc !== "public, no-cache") {
            fail(`GET /favicon.png wrong Cache-Control (${favCc})`);
          } else if (!fav.headers.get("content-type")?.includes("png")) {
            fail(`GET /favicon.png wrong Content-Type`);
          } else ok("GET /favicon.png → 200 revalidated");
        }
      } finally {
        try {
          prod.kill("SIGTERM");
        } catch { /* already terminated */ }
        try {
          await prod.status;
        } catch { /* already gone */ }
        await drainingProd.catch(() => {});
      }
    }
  }
} finally {
  await Deno.remove(workRoot, { recursive: true }).catch(() => {});
}

console.log(failed ? "\nSMOKE FAILED" : "\nSMOKE PASSED");
Deno.exit(failed ? 1 : 0);
