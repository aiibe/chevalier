// Headless-browser smoke test for the prod build: guards that a nonce CSP
// doesn't block island hydration. Clicks the counter and asserts it goes from
// SSR "counts: 3" to "counts: 4" with no CSP violation.
//
// Run: deno task check:hydration  (builds, serves dist/, drives Chrome)
// Needs Chrome/Chromium; set ASTRAL_BIN to override the detected path.

import { launch } from "@astral/astral";
import { serveDir } from "@std/http/file-server";
import serverApp from "../dist/server/server.mjs";

const PORT = 8799;
const BASE = `http://localhost:${PORT}`;
const CLIENT_DIR = new URL("../dist/client", import.meta.url).pathname;

// Serve built client chunks from dist/client (a real deploy uses a CDN / static
// host); everything else falls through to the SSR app.
const handler = async (req: Request): Promise<Response> => {
  if (new URL(req.url).pathname.startsWith("/assets/")) {
    return await serveDir(req, { fsRoot: CLIENT_DIR, quiet: true });
  }
  return await serverApp.fetch(req);
};

const server = Deno.serve({ port: PORT, onListen() {} }, handler);

const fail = (msg: string) => {
  failed = true;
  console.error(`FAIL: ${msg}`);
};
let failed = false;

try {
  const head = await fetch(BASE);
  await head.body?.cancel();
  const csp = head.headers.get("content-security-policy") ?? "";
  console.log(`CSP: ${csp || "(none)"}`);
  if (!/script-src[^;]*nonce-/.test(csp)) {
    fail("no nonce-based script-src in the CSP header");
  }

  const browser = await launch({
    path: Deno.env.get("ASTRAL_BIN") ??
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  try {
    const page = await browser.newPage();
    // A CSP block surfaces as a securitypolicyviolation event in-page.
    const cspViolations: string[] = [];
    page.addEventListener("console", (e) => {
      if (e.detail.text.startsWith("CSP_VIOLATION")) {
        cspViolations.push(e.detail.text);
      }
    });
    await page.evaluate(() => {
      globalThis.addEventListener("securitypolicyviolation", (ev) => {
        console.error(
          `CSP_VIOLATION ${ev.violatedDirective} blocked ${ev.blockedURI}`,
        );
      });
    });

    await page.goto(BASE, { waitUntil: "networkidle2" });

    const button = await page.$("button");
    if (!button) throw new Error("counter button not found in DOM");

    const text = (el: HTMLButtonElement) => el.textContent;
    const before = await button.evaluate(text);
    // Poll after clicking: hydration + Preact re-render is async.
    await button.evaluate((el: HTMLButtonElement) => el.click());
    let after = before;
    for (let i = 0; i < 20 && after === before; i++) {
      await new Promise((r) => setTimeout(r, 50));
      after = await button.evaluate(text);
    }

    console.log(
      `button: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`,
    );
    console.log(`CSP violations: ${cspViolations.length}`);
    cspViolations.forEach((e) => console.log(`  - ${e}`));

    if (before !== "counts: 3") fail(`expected SSR "counts: 3", got ${before}`);
    if (after !== "counts: 4") {
      fail("click did not increment — island did not hydrate (CSP block?)");
    }
    if (cspViolations.length > 0) fail("CSP violations reported");

    if (!failed) {
      console.log("\nPASS: island hydrated under CSP, no violations");
    }
  } finally {
    await browser.close();
  }
} finally {
  await server.shutdown();
}

Deno.exit(failed ? 1 : 0);
