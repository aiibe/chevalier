import {
  assertEquals,
  assertNotMatch,
  assertRejects,
  assertStringIncludes,
} from "@std/assert";
import { fromFileUrl } from "@std/path";
import { createTestApp } from "./testing.ts";

const appUrl = new URL("./testdata/app", import.meta.url);
const app = await createTestApp(appUrl);

Deno.test("page renders loader data inside the layout and shell", async () => {
  const res = await app.request("/");
  assertEquals(res.status, 200);
  const html = await res.text();
  assertStringIncludes(html, "hello from loader");
  assertStringIncludes(html, 'class="fixture-layout"');
  assertStringIncludes(html, 'data-shell="fixture"');
});

Deno.test("dynamic segment reaches the page as params", async () => {
  const res = await app.request("/hello/world");
  assertEquals(res.status, 200);
  assertStringIncludes(await res.text(), "hi world");
});

Deno.test("layout receives route context: url, matched path, params", async () => {
  const html = await (await app.request("/hello/world")).text();
  assertStringIncludes(html, 'data-route-url="/hello/world"');
  assertStringIncludes(html, 'data-route-path="/hello/:name"');
  assertStringIncludes(html, "&quot;name&quot;:&quot;world&quot;");
});

Deno.test("action runs on same-path POST", async () => {
  const res = await app.request("/submit", {
    method: "POST",
    redirect: "manual",
  });
  assertEquals(res.status, 303);
  assertEquals(res.headers.get("location"), "/");
});

Deno.test("middleware guards its directory", async () => {
  const denied = await app.request("/admin", { redirect: "manual" });
  assertEquals(denied.status, 302);
  assertEquals(denied.headers.get("location"), "/login");

  const allowed = await app.request("/admin", {
    headers: { "x-auth": "yes" },
  });
  assertEquals(allowed.status, 200);
  assertStringIncludes(await allowed.text(), "admin area");
});

Deno.test("handler module serves its sub-app", async () => {
  const res = await app.request("/api");
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true });
});

Deno.test("unmatched path renders _404 with status 404", async () => {
  const res = await app.request("/nope");
  assertEquals(res.status, 404);
  assertStringIncludes(await res.text(), "fixture 404");
});

Deno.test("island renders inline without hydration marker or boot", async () => {
  const res = await app.request("/widgets");
  assertEquals(res.status, 200);
  const html = await res.text();
  assertStringIncludes(html, "fixture badge");
  assertNotMatch(html, /<!--chevalier:/);
});

Deno.test("accepts a path string too", async () => {
  const byPath = await createTestApp(fromFileUrl(appUrl));
  assertEquals((await byPath.request("/")).status, 200);
});

Deno.test("rejects a directory without routes/", async () => {
  await assertRejects(
    () => createTestApp(new URL("./testdata", import.meta.url)),
    Error,
    "no routes/",
  );
});
