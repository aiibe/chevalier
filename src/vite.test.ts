import { assertEquals } from "@std/assert";
import { chevalier } from "./vite.ts";

// deno-lint-ignore no-explicit-any
type AnyPlugin = any;

/** The chevalier core plugin out of the returned [core, prefresh] array. */
function corePlugin(): AnyPlugin {
  const plugins = chevalier({ appRoot: "./app" }) as AnyPlugin[];
  const core = plugins.find((p) => p.name === "chevalier");
  if (!core) throw new Error("chevalier core plugin not found");
  return core;
}

// Hot-reload policy: routes and _layout full-reload (deterministic SSR);
// islands fall through to prefresh HMR (return undefined → default handling).
Deno.test("hot-reload — full reload on route/layout, not islands", () => {
  const p = corePlugin();
  const sent: unknown[] = [];
  const server = { ws: { send: (m: unknown) => sent.push(m) } };
  const root = "/proj/app";

  // Routes and layout still full-reload.
  for (
    const f of [
      `${root}/routes/index.tsx`,
      `${root}/routes/_layout.tsx`,
    ]
  ) {
    sent.length = 0;
    const r = p.handleHotUpdate({ file: f, server });
    assertEquals(r, [], `should swallow HMR for ${f}`);
    assertEquals(sent, [{ type: "full-reload" }], `should reload for ${f}`);
  }

  // Islands no longer full-reload — they HMR via prefresh, so handleHotUpdate
  // returns undefined (default) and sends no full-reload message.
  for (
    const f of [
      `${root}/islands/counter.tsx`,
      `${root}/routes/blog/$comments.tsx`, // Rule B island
    ]
  ) {
    sent.length = 0;
    const r = p.handleHotUpdate({ file: f, server });
    assertEquals(r, undefined, `island should not be swallowed: ${f}`);
    assertEquals(sent, [], `island should not full-reload: ${f}`);
  }

  // A non-app file passes through (undefined → default HMR).
  sent.length = 0;
  assertEquals(
    p.handleHotUpdate({ file: "/proj/vite.config.ts", server }),
    undefined,
  );
  assertEquals(sent, []);
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

// The plugin returns [core, prefresh]; both must be present so islands HMR.
Deno.test("chevalier returns core + scoped prefresh plugins", () => {
  const plugins = chevalier({ appRoot: "./app" }) as AnyPlugin[];
  assertEquals(Array.isArray(plugins), true);
  const names = plugins.map((p) => p.name);
  assertEquals(names.includes("chevalier"), true);
  assertEquals(names.includes("chevalier:prefresh"), true);
});
