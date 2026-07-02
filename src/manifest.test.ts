import { assertEquals } from "@std/assert";
import {
  CLIENT_DEV_URL,
  resolveClientEntry,
  resolveIslandUrl,
  resolveIslandUrls,
  type ViteManifest,
} from "./manifest.ts";

const manifest: ViteManifest = {
  "chevalier:client": {
    file: "assets/chevalier-client-Dv3fyGqv.js",
    name: "chevalier-client",
    isEntry: true,
  },
  "app/islands/counter.tsx": { file: "assets/counter-A1b2C3d4.js" },
  "app/islands/clock.jsx": { file: "assets/clock-E5f6G7h8.js" },
};

Deno.test("no manifest (dev) → client dev URL", () => {
  assertEquals(resolveClientEntry(undefined), CLIENT_DEV_URL);
});

Deno.test("manifest → chevalier-client chunk located by name", () => {
  assertEquals(
    resolveClientEntry(manifest),
    "/assets/chevalier-client-Dv3fyGqv.js",
  );
});

Deno.test("manifest without the client chunk → dev URL (degrade, don't throw)", () => {
  const { "chevalier:client": _drop, ...noClient } = manifest;
  assertEquals(resolveClientEntry(noClient), CLIENT_DEV_URL);
});

Deno.test("resolveIslandUrl — id → hashed chunk (tries tsx then jsx)", () => {
  assertEquals(
    resolveIslandUrl("islands/counter", manifest),
    "/assets/counter-A1b2C3d4.js",
  );
  assertEquals(
    resolveIslandUrl("islands/clock", manifest),
    "/assets/clock-E5f6G7h8.js",
  );
});

Deno.test("resolveIslandUrl — no manifest / miss → null", () => {
  assertEquals(resolveIslandUrl("islands/counter", undefined), null);
  assertEquals(resolveIslandUrl("islands/missing", manifest), null);
});

Deno.test("resolveIslandUrls — dev map rewritten to hashed chunks", () => {
  const dev = {
    "islands/counter": "/app/islands/counter.tsx",
    "islands/clock": "/app/islands/clock.jsx",
  };
  assertEquals(resolveIslandUrls(dev, manifest), {
    "islands/counter": "/assets/counter-A1b2C3d4.js",
    "islands/clock": "/assets/clock-E5f6G7h8.js",
  });
});

Deno.test("resolveIslandUrls — no manifest (dev) returns dev URLs unchanged", () => {
  const dev = { "islands/counter": "/app/islands/counter.tsx" };
  assertEquals(resolveIslandUrls(dev, undefined), dev);
});

Deno.test("resolveIslandUrls — unresolved id falls back to its dev URL", () => {
  const dev = { "islands/orphan": "/app/islands/orphan.tsx" };
  assertEquals(resolveIslandUrls(dev, manifest), dev);
});
