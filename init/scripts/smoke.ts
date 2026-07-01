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
const BASE = `http://127.0.0.1:${PORT}`;

let failed = false;
const fail = (msg: string) => {
  failed = true;
  console.error(`FAIL: ${msg}`);
};
const ok = (msg: string) => console.log(`ok: ${msg}`);

console.log(`mode: ${USE_JSR ? "published JSR core" : "local src core"}`);

const workRoot = await Deno.makeTempDir({ prefix: "chevalier-smoke-" });
const APP = `${workRoot}/smoke-app`;

async function run(
  cmd: string[],
  opts: { cwd?: string; env?: Record<string, string> } = {},
): Promise<Deno.CommandOutput> {
  const [bin, ...args] = cmd;
  return await new Deno.Command(bin, {
    args,
    cwd: opts.cwd,
    env: opts.env,
    stdout: "piped",
    stderr: "piped",
  }).output();
}

const dec = new TextDecoder();

try {
  // 1. Scaffold.
  const scaffold = await run(["deno", "run", "-A", INIT_MOD, "smoke-app"], {
    cwd: workRoot,
  });
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
    const map = JSON.parse(await Deno.readTextFile(denoJsonPath))
      .imports as Record<string, string>;
    for (
      const spec of ["chevalier", "chevalier/client", "chevalier/registry"]
    ) {
      // Explicit try/catch + Deno.exit: `deno eval` exits 0 even on an uncaught
      // top-level import rejection, so a bare `await import(...)` false-passes.
      // cwd: APP so the app's deno.json (only the jsr: pin) governs resolution;
      // from the repo root, the workspace deno.json shadows it with local src/.
      const check = await run([
        "deno",
        "eval",
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
    // Repoint the import map at local core so CI tests the code in the PR
    // without depending on a publish.
    const denoJson = await Deno.readTextFile(denoJsonPath);
    const patched = denoJson
      .replace(/"chevalier":\s*"[^"]*"/, `"chevalier": "${CORE_SRC}/mod.ts"`)
      .replace(
        /"chevalier\/client":\s*"[^"]*"/,
        `"chevalier/client": "${CORE_SRC}/client.ts"`,
      )
      .replace(
        /"chevalier\/registry":\s*"[^"]*"/,
        `"chevalier/registry": "${CORE_SRC}/registry.tsx"`,
      );
    if (patched === denoJson) {
      fail("import-map repoint matched nothing — template shape changed");
      throw new Error("repoint failed");
    }
    await Deno.writeTextFile(denoJsonPath, patched);
    ok("repointed core to local src");
  }

  // 3. Dev server: boot, then assert SSR + island + handler responses.
  // `deno task dev` runs `vite`; extra args after it reach vite (--port, --host).
  const dev = new Deno.Command("deno", {
    args: ["task", "dev", "--port", String(PORT), "--host", "127.0.0.1"],
    cwd: APP,
    stdout: "piped",
    stderr: "piped",
  }).spawn();

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
    } else {
      ok("dev server up");

      const home = await (await fetch(BASE)).text();
      if (!home.includes("<h1>Chevalier</h1>")) fail("/ missing SSR heading");
      else ok("/ SSR renders");
      if (!home.includes("counts: 3")) fail("/ island not SSR'd (counts: 3)");
      else ok("/ island SSR'd");
      if (!home.includes("hydrateIslands")) {
        fail("/ missing island boot script");
      } else ok("/ island boot script present");

      const api = await (await fetch(`${BASE}/api`)).json();
      if (api?.ok !== true) fail("/api did not return { ok: true }");
      else ok("/api handler responds");

      const echo = await (await fetch(`${BASE}/api/echo`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hi: 1 }),
      })).json();
      if (echo?.echo?.hi !== 1) fail("POST /api/echo did not echo body");
      else ok("POST /api/echo echoes");

      const aboutRes = await fetch(`${BASE}/about`);
      const about = await aboutRes.text();
      if (aboutRes.status !== 200) fail("/about not 200");
      else if (!about.includes("<h1>About</h1>")) {
        fail("/about missing heading");
      } else ok("/about renders");

      const notFound = await fetch(`${BASE}/does-not-exist`);
      await notFound.body?.cancel();
      if (notFound.status !== 404) {
        fail(`unmatched route not 404 (${notFound.status})`);
      } else ok("unmatched route → 404");
    }
  } finally {
    dev.kill("SIGTERM");
    try {
      await dev.status;
    } catch { /* already gone */ }
  }

  // 4. Build: client + SSR output must exist.
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
  }
} finally {
  await Deno.remove(workRoot, { recursive: true }).catch(() => {});
}

console.log(failed ? "\nSMOKE FAILED" : "\nSMOKE PASSED");
Deno.exit(failed ? 1 : 0);
