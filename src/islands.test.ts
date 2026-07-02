import { assertEquals } from "@std/assert";
import { isExcluded, isIsland, islandId, normalizePath } from "./islands.ts";
import { createRoutes, fileToPath } from "./router.ts";

Deno.test("islands/ dir, recursive", () => {
  assertEquals(isIsland("islands/counter.tsx"), true);
  assertEquals(isIsland("islands/nested/widget.jsx"), true);
  assertEquals(isIsland("routes/blog/islands/x.tsx"), true); // reserved at depth
});

Deno.test("exclusions take precedence", () => {
  assertEquals(isIsland("islands/_helper.tsx"), false);
  assertEquals(isIsland("islands/counter.test.tsx"), false);
  assertEquals(isIsland("islands/types.d.ts"), false);
  assertEquals(isIsland("islands/styles.css"), false);
  assertEquals(isIsland("islands/util.ts"), false);
  assertEquals(isExcluded("routes/_layout.tsx"), true);
});

Deno.test("non-islands", () => {
  assertEquals(isIsland("routes/index.tsx"), false);
  assertEquals(isIsland("routes/about.tsx"), false);
});

Deno.test("islandId drops extension, normalized", () => {
  assertEquals(islandId("islands/counter.tsx"), "islands/counter");
  assertEquals(
    islandId("./islands/nested/widget.jsx"),
    "islands/nested/widget",
  );
  assertEquals(normalizePath("\\a\\b"), "/a/b".replace(/^\//, ""));
});

Deno.test("fileToPath", () => {
  assertEquals(fileToPath("routes/index.tsx"), "/");
  assertEquals(fileToPath("routes/about.tsx"), "/about");
  assertEquals(fileToPath("routes/blog/index.tsx"), "/blog");
  assertEquals(fileToPath("routes/blog/[slug].tsx"), "/blog/:slug");
  assertEquals(fileToPath("routes/docs/[...rest].tsx"), "/docs/:rest{.+}");
});

// createRoutes' exclusion filter: pages and .ts handlers become routes;
// convention/test/type files don't.
Deno.test("createRoutes filters non-route files", () => {
  const noop = () => Promise.resolve({});
  const files = [
    "routes/index.tsx", // page → /
    "routes/about.tsx", // page → /about
    "routes/api.ts", // handler → /api (kept)
    "routes/_layout.tsx", // convention → dropped
    "routes/home.test.tsx", // test → dropped
    "routes/util.spec.ts", // spec → dropped
    "routes/types.d.ts", // types → dropped
  ];
  const mods = Object.fromEntries(files.map((f) => [f, noop]));
  const paths = createRoutes(mods).map((r) => r.path).sort();
  assertEquals(paths, ["/", "/about", "/api"]);
});

Deno.test("catch-all route matches in Hono", async () => {
  const { Hono } = await import("hono");
  const app = new Hono();
  app.get(
    fileToPath("routes/docs/[...rest].tsx"),
    (c) => c.text(c.req.param("rest") ?? ""),
  );
  const res = await app.request("/docs/a/b/c");
  assertEquals(res.status, 200);
  assertEquals(await res.text(), "a/b/c");
});
