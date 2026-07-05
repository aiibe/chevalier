// Island SSR wrapper + props collection. Renders delimited by bare HTML comment
// markers `chevalier:{c}:{p}`/`/chevalier`; props collect per-request into a deduped array, not the DOM.

import type { ComponentType, VNode } from "preact";
import { Fragment, h as preactH } from "preact";

// Loosely-typed h so we can pass UNSTABLE_comment, which renders a Fragment
// as a bare HTML comment — the only way to emit a wrapper-free comment range.
const h = preactH as (
  type: unknown,
  props: Record<string, unknown> | null,
  ...children: unknown[]
) => VNode;

/** Comment marker. Open: `chevalier:{componentIdx}:{propsIdx}`; close: `/chevalier`. */
export const MARKER_PREFIX = "chevalier";
export const MARKER_CLOSE = "/chevalier";

/** Strip children (server-rendered into the range, re-derived from the DOM). */
function stripChildren(
  props: Record<string, unknown>,
): Record<string, unknown> {
  const { children: _children, ...rest } = props as { children?: unknown };
  return rest;
}

interface Collector {
  /** island id → component index (first-seen order = boot import order). */
  ids: Map<string, number>;
  props: Record<string, unknown>[];
  propsDedup: Map<string, number>;
  // Island-nesting depth; >0 means inside another island, so nested islands
  // emit no marker (the outer one re-renders them on the client).
  depth: number;
  // Head vnodes a page pushes via <PageHead> during this render, teleported into
  // the shell's real <head> afterward (see src/layout.tsx pushHead/PageHead).
  head: VNode[];
}

// renderToString is sync/single-threaded, so a module-level current collector
// is safe — no context threading needed.
let currentCollector: Collector | null = null;

/**
 * Run `fn` under a fresh collector; returns its result plus the collected
 * island ids/props and any page-contributed head vnodes.
 */
export function collectIslands<T>(
  fn: () => T,
): { html: T; ids: string[]; props: Record<string, unknown>[]; head: VNode[] } {
  const prev = currentCollector;
  const collector: Collector = {
    ids: new Map(),
    props: [],
    propsDedup: new Map(),
    depth: 0,
    head: [],
  };
  currentCollector = collector;
  try {
    const html = fn();
    return {
      html,
      ids: [...collector.ids.keys()],
      props: collector.props,
      head: collector.head,
    };
  } finally {
    currentCollector = prev; // restore, not null — supports nesting
  }
}

/** Push a page's <PageHead> children into the active collector. No-op with no collector. */
export function pushHead(node: VNode): void {
  currentCollector?.head.push(node);
}

/** id → component index in the active collector, assigned on first sight. */
function collectComponent(id: string): number {
  if (!currentCollector) return 0;
  let idx = currentCollector.ids.get(id);
  if (idx === undefined) {
    idx = currentCollector.ids.size;
    currentCollector.ids.set(id, idx);
  }
  return idx;
}

function propsError(id: string, path: string, problem: string): Error {
  return new Error(
    `Island "${id}" prop \`${path}\` won't survive serialization to the client: ${problem}. ` +
      `Island props must be JSON-safe: strings, finite numbers, booleans, null, plain objects/arrays.`,
  );
}

// Throw unless `v` survives a JSON round-trip unchanged — bare stringify would
// mangle it silently and the island hydrates subtly wrong.
function assertRoundTrips(
  v: unknown,
  id: string,
  path: string,
  seen: Set<object>,
): void {
  switch (typeof v) {
    case "string":
    case "boolean":
      return;
    case "number":
      if (Number.isFinite(v)) return;
      throw propsError(id, path, `${v} serializes to null`);
    case "bigint":
    case "function":
    case "symbol":
      throw propsError(id, path, `a ${typeof v} cannot be serialized`);
  }
  if (v === null) return;
  const obj = v as object;
  if (seen.has(obj)) throw propsError(id, path, "circular reference");
  seen.add(obj);
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => {
      if (item === undefined) {
        throw propsError(id, `${path}[${i}]`, "undefined serializes to null");
      }
      assertRoundTrips(item, id, `${path}[${i}]`, seen);
    });
  } else {
    const proto = Object.getPrototypeOf(obj);
    if (proto !== Object.prototype && proto !== null) {
      const name = obj.constructor?.name ?? "object";
      throw propsError(
        id,
        path,
        `a ${name} does not survive JSON (e.g. Date → string, Map/Set → {})`,
      );
    }
    for (const [k, val] of Object.entries(obj)) {
      // A dropped undefined key reads back as undefined on the client — fine.
      if (val === undefined) continue;
      assertRoundTrips(val, id, path ? `${path}.${k}` : k, seen);
    }
  }
  seen.delete(obj);
}

/** props → its index in the deduped props array; identical props share a slot. */
function collectProps(id: string, props: Record<string, unknown>): number {
  if (!currentCollector) return 0;
  const rest = stripChildren(props);
  // Validate before dedup: the key is lossy, so a bad prop could alias a clean one.
  assertRoundTrips(rest, id, "", new Set());
  const key = JSON.stringify(rest);
  let idx = currentCollector.propsDedup.get(key);
  if (idx === undefined) {
    idx = currentCollector.props.push(rest) - 1;
    currentCollector.propsDedup.set(key, idx);
  }
  return idx;
}

// Depth guards bracketing an island's children; pair correctly because
// renderToString is sync + depth-first.
const Enter = (): null => {
  if (currentCollector) currentCollector.depth++;
  return null;
};
const Leave = (): null => {
  if (currentCollector) currentCollector.depth--;
  return null;
};

/** `id` is the island's stable id (islandId from src/islands.ts). */
export function island<P extends Record<string, unknown>>(
  Component: ComponentType<P>,
  id: string,
): ComponentType<P> {
  const Wrapped = (props: P): VNode => {
    // Nested island: the outer island re-renders this subtree on the client, so
    // emit it as plain HTML — no marker, no collected props, no depth change.
    if (currentCollector && currentCollector.depth > 0) {
      return h(Component, props as Record<string, unknown>) as VNode;
    }
    // Rendering is the collection pass — record component + props indices.
    const c = collectComponent(id);
    const p = collectProps(id, props as Record<string, unknown>);
    return h(
      Fragment,
      null,
      h(Fragment, { UNSTABLE_comment: `${MARKER_PREFIX}:${c}:${p}` }),
      h(Enter, null),
      h(Component, props as Record<string, unknown>),
      h(Leave, null),
      h(Fragment, { UNSTABLE_comment: MARKER_CLOSE }),
    );
  };
  Wrapped.displayName = `Island(${id})`;
  return Wrapped as ComponentType<P>;
}
