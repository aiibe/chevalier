// Walks the SSR'd DOM for comment-range markers (src/registry.tsx) and hydrates
// each island in place, using boot-supplied component/props arrays as the source of truth.

import type { ComponentType } from "preact";
import { h, hydrate } from "preact";
import { MARKER_CLOSE, MARKER_PREFIX } from "./registry.tsx";

export type IslandRegistry = ComponentType<Record<string, unknown>>[];
export type IslandProps = Record<string, unknown>[];

interface Root {
  componentIdx: number;
  propsIdx: number;
  start: Comment;
  end: Comment | null;
}

const OPEN_RE = new RegExp(`^${MARKER_PREFIX}:(\\d+):(\\d+)$`);

/**
 * A container that makes preact treat the sibling range between `start` and
 * `end` as a single element, so hydrate() targets exactly the island's markup
 * without a wrapper node. Ported from Fresh's reviver. Multiple islands can
 * share a parent, so appends/inserts land before `end`, not at the parent's tail.
 */
function createRootFragment(
  parent: Node,
  start: Comment,
  end: Comment,
): HTMLElement {
  const frag = {
    nodeType: 1,
    parentNode: parent,
    get firstChild() {
      const child = start.nextSibling;
      return child === end ? null : child;
    },
    get childNodes() {
      const out: ChildNode[] = [];
      let child = start.nextSibling;
      while (child !== null && child !== end) {
        out.push(child);
        child = child.nextSibling;
      }
      return out;
    },
    insertBefore(node: Node, child: Node | null) {
      parent.insertBefore(node, child ?? end);
    },
    appendChild(child: Node) {
      parent.insertBefore(child, end);
    },
    removeChild(child: Node) {
      parent.removeChild(child);
    },
  };
  return frag as unknown as HTMLElement;
}

function collectRoots(): Root[] {
  const roots: Root[] = [];
  const open: Root[] = []; // stack — ranges can nest
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_COMMENT,
  );
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const comment = node as Comment;
    const data = comment.data;
    const m = OPEN_RE.exec(data);
    if (m) {
      open.push({
        componentIdx: Number(m[1]),
        propsIdx: Number(m[2]),
        start: comment,
        end: null,
      });
    } else if (data === MARKER_CLOSE) {
      const root = open.pop();
      if (root) {
        root.end = comment;
        roots.push(root);
      }
    }
  }
  return roots;
}

export function hydrateIslands(
  registry: IslandRegistry,
  props: IslandProps = [],
): void {
  for (const root of collectRoots()) {
    if (!root.end) continue;
    const Component = registry[root.componentIdx];
    if (!Component) {
      console.warn(`[chevalier] no island at boot index ${root.componentIdx}`);
      continue;
    }
    // Invalid HTML nesting can reparent markers to different parents; hydrating would throw.
    if (root.start.parentNode !== root.end.parentNode) {
      console.error(
        `[chevalier] island ${root.componentIdx} markers were reparented (invalid HTML nesting) — skipping`,
      );
      continue;
    }
    const container = createRootFragment(
      root.start.parentNode!,
      root.start,
      root.end,
    );
    hydrate(h(Component, props[root.propsIdx] ?? {}), container);
  }
}

export default hydrateIslands;
