import { assertEquals } from "@std/assert";
import { buildBoot } from "./boot.ts";

Deno.test("buildBoot — no islands ships zero JS", () => {
  assertEquals(buildBoot([], [], {}, "/app/client.ts"), "");
});

Deno.test("buildBoot — imports the page's islands and passes components + props", () => {
  const boot = buildBoot(
    ["islands/counter", "islands/clock"],
    [{ start: 3 }, {}],
    {
      "islands/counter": "/assets/counter-a1b2.js",
      "islands/clock": "/assets/clock-c3d4.js",
      "islands/unused": "/assets/unused.js",
    },
    "/assets/client-x.js",
  );
  assertEquals(
    boot.includes(`import { hydrateIslands } from "/assets/client-x.js";`),
    true,
  );
  assertEquals(boot.includes(`/assets/counter-a1b2.js`), true);
  assertEquals(boot.includes(`/assets/clock-c3d4.js`), true);
  assertEquals(boot.includes("unused"), false);
  assertEquals(
    boot.includes(
      `hydrateIslands([m0.default,m1.default],[{"start":3},{}]);`,
    ),
    true,
  );
});

Deno.test("buildBoot — escapes < in props so it can't break out of </script>", () => {
  const boot = buildBoot(
    ["islands/a"],
    [{ html: "</script><b>" }],
    { "islands/a": "/a.js" },
    "/c.js",
  );
  assertEquals(boot.includes("</script>"), false);
  assertEquals(boot.includes("\\u003c/script>"), true);
});
