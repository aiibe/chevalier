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
}

// renderToString is sync/single-threaded, so a module-level "current
// collector" is safe here — no context threading needed.
let currentCollector: Collector | null = null;

/** Run `fn` under a fresh collector; returns its result plus the collected ids/props. */
export function collectIslands<T>(
  fn: () => T,
): { html: T; ids: string[]; props: Record<string, unknown>[] } {
  const prev = currentCollector;
  const collector: Collector = {
    ids: new Map(),
    props: [],
    propsDedup: new Map(),
  };
  currentCollector = collector;
  try {
    const html = fn();
    return { html, ids: [...collector.ids.keys()], props: collector.props };
  } finally {
    currentCollector = prev; // restore, not null — supports nesting
  }
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

/** props → its index in the deduped props array; identical props share a slot. */
function collectProps(props: Record<string, unknown>): number {
  if (!currentCollector) return 0;
  const rest = stripChildren(props);
  const key = JSON.stringify(rest);
  let idx = currentCollector.propsDedup.get(key);
  if (idx === undefined) {
    idx = currentCollector.props.push(rest) - 1;
    currentCollector.propsDedup.set(key, idx);
  }
  return idx;
}

/** `id` is the island's stable id (islandId from src/islands.ts). */
export function island<P extends Record<string, unknown>>(
  Component: ComponentType<P>,
  id: string,
): ComponentType<P> {
  const Wrapped = (props: P): VNode => {
    // Rendering is the collection pass — record component + props indices.
    const c = collectComponent(id);
    const p = collectProps(props as Record<string, unknown>);
    return h(
      Fragment,
      null,
      h(Fragment, { UNSTABLE_comment: `${MARKER_PREFIX}:${c}:${p}` }),
      h(Component, props as Record<string, unknown>),
      h(Fragment, { UNSTABLE_comment: MARKER_CLOSE }),
    );
  };
  Wrapped.displayName = `Island(${id})`;
  return Wrapped as ComponentType<P>;
}
