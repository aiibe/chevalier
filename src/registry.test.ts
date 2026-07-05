import { assertEquals, assertThrows } from "@std/assert";
import { renderToString } from "preact-render-to-string";
import { h } from "preact";
import { collectIslands, island } from "./registry.tsx";

const Leaf = (p: { label: string }) => h("span", null, p.label);

Deno.test("collectIslands captures rendered island ids in first-seen order", () => {
  const A = island(Leaf, "islands/a");
  const B = island(Leaf, "islands/b");
  const { html, ids } = collectIslands(() =>
    renderToString(
      h("div", null, h(A, { label: "a" }), h(B, { label: "b" })) as never,
    )
  );
  assertEquals(ids, ["islands/a", "islands/b"]);
  // Comment markers only — no wrapper element, no data-*, no props in the DOM.
  assertEquals(html.includes("<!--chevalier:0:0-->"), true);
  assertEquals(html.includes("<!--chevalier:1:1-->"), true);
  assertEquals(html.includes("<!--/chevalier-->"), true);
  assertEquals(html.includes("chevalier-island"), false);
  assertEquals(html.includes("data-chevalier"), false);
  assertEquals(/<!--chevalier:\d+:\d+-->/.test(html), true);
  assertEquals(html.includes("label"), false);
});

Deno.test("props collected into a deduped array; markers index into it", () => {
  const A = island(Leaf as never, "islands/a");
  const B = island(Leaf as never, "islands/b");
  const { html, ids, props } = collectIslands(() =>
    renderToString(
      h(
        "div",
        null,
        h(A, { label: "x" }),
        h(B, { label: "x" }),
        h(A, { label: "y" }),
      ) as never,
    )
  );
  assertEquals(ids, ["islands/a", "islands/b"]);
  // Identical props {label:"x"} share slot 0; {label:"y"} is slot 1.
  assertEquals(props, [{ label: "x" }, { label: "y" }]);
  assertEquals(html.includes("<!--chevalier:0:0-->"), true);
  assertEquals(html.includes("<!--chevalier:1:0-->"), true);
  assertEquals(html.includes("<!--chevalier:0:1-->"), true);
});

Deno.test("children are stripped from collected props", () => {
  const Wrap = island(
    ((p: { children?: never; k: number }) =>
      h("div", null, p.children)) as never,
    "islands/wrap",
  );
  const { props } = collectIslands(() =>
    renderToString(h(Wrap, { k: 1, children: h("b", null, "hi") }) as never)
  );
  assertEquals(props, [{ k: 1 }]);
});

Deno.test("an island rendered twice is collected once (component dedup)", () => {
  const A = island(Leaf, "islands/a");
  const { ids } = collectIslands(() =>
    renderToString(
      h("div", null, h(A, { label: "1" }), h(A, { label: "2" })) as never,
    )
  );
  assertEquals(ids, ["islands/a"]);
});

Deno.test("no islands → empty ids", () => {
  const { ids } = collectIslands(() =>
    renderToString(h("div", null, "static") as never)
  );
  assertEquals(ids, []);
});

Deno.test("nested island emits no marker; outer owns the subtree", () => {
  const Inner = island(Leaf, "islands/inner");
  const Outer = island(
    (() => h("div", null, h(Inner, { label: "in" }))) as never,
    "islands/outer",
  );
  const { html, ids, props } = collectIslands(() =>
    renderToString(h(Outer, {}) as never)
  );
  // Only the outer island is collected + hydrated.
  assertEquals(ids, ["islands/outer"]);
  assertEquals(props, [{}]);
  // One marker pair (outer's), and inner's content is inlined as plain HTML.
  assertEquals(html.includes("<!--chevalier:0:0-->"), true);
  assertEquals(html.match(/<!--chevalier:\d+:\d+-->/g)?.length, 1);
  assertEquals(html.includes("<span>in</span>"), true);
});

Deno.test("depth restores after an island: a later sibling island still marks", () => {
  const A = island(Leaf, "islands/a");
  const B = island(Leaf, "islands/b");
  // A is a leaf island; B is a sibling, not nested — both must be collected.
  const { ids, html } = collectIslands(() =>
    renderToString(
      h("div", null, h(A, { label: "a" }), h(B, { label: "b" })) as never,
    )
  );
  assertEquals(ids, ["islands/a", "islands/b"]);
  assertEquals(html.match(/<!--chevalier:\d+:\d+-->/g)?.length, 2);
});

// A component that ignores its props, for serialization-failure tests.
const Sink = (() => h("span", null, "x")) as never;

function renderWith(props: Record<string, unknown>): ReturnType<
  typeof collectIslands<string>
> {
  const A = island(Sink, "islands/a");
  return collectIslands(() => renderToString(h(A, props) as never));
}

Deno.test("non-round-tripping props throw with island id and prop path", () => {
  const err = assertThrows(
    () => renderWith({ user: { createdAt: new Date() } }),
    Error,
  );
  assertEquals(err.message.includes(`Island "islands/a"`), true);
  assertEquals(err.message.includes("user.createdAt"), true);
  assertEquals(err.message.includes("Date"), true);
});

Deno.test("functions, Map/Set, NaN, and bigint props throw", () => {
  assertThrows(() => renderWith({ onClick: () => {} }), Error, "function");
  assertThrows(() => renderWith({ m: new Map() }), Error, "Map");
  assertThrows(() => renderWith({ s: new Set() }), Error, "Set");
  assertThrows(() => renderWith({ n: NaN }), Error, "NaN");
  assertThrows(() => renderWith({ b: 1n }), Error, "bigint");
});

Deno.test("class instances and circular references throw", () => {
  class Row {
    id = 1;
  }
  assertThrows(() => renderWith({ row: new Row() }), Error, "Row");
  const loop: Record<string, unknown> = {};
  loop.self = loop;
  assertThrows(() => renderWith({ loop }), Error, "circular");
});

Deno.test("undefined in an array throws; as an object value it is allowed", () => {
  assertThrows(
    () => renderWith({ items: [1, undefined] }),
    Error,
    "items[1]",
  );
  // Dropped key reads back as undefined on the client — same result, no throw.
  const { props } = renderWith({ maybe: undefined, k: 1 });
  assertEquals(JSON.parse(JSON.stringify(props)), [{ k: 1 }]);
});

Deno.test("JSON-safe props pass: nested plain objects, arrays, null", () => {
  const value = { a: [1, "two", null, { deep: true }], b: { c: -0.5 } };
  const { props } = renderWith(value);
  assertEquals(props, [value]);
});

Deno.test("nested island props are not validated (never serialized)", () => {
  const Inner = island(Sink, "islands/inner");
  const Outer = island(
    (() => h("div", null, h(Inner, { when: new Date() } as never))) as never,
    "islands/outer",
  );
  // Outer re-renders Inner on the client, so Inner's Date prop never ships.
  const { ids } = collectIslands(() => renderToString(h(Outer, {}) as never));
  assertEquals(ids, ["islands/outer"]);
});

Deno.test("collector restores previous on nesting, not null", () => {
  const A = island(Leaf, "islands/a");
  const B = island(Leaf, "islands/b");
  let inner: string[] = [];
  const { ids: outer } = collectIslands(() => {
    renderToString(h(A, { label: "a" }) as never);
    inner = collectIslands(() =>
      renderToString(h(B, { label: "b" }) as never)
    ).ids;
    return renderToString(h(A, { label: "a2" }) as never);
  });
  assertEquals(inner, ["islands/b"]);
  assertEquals(outer, ["islands/a"]);
});
