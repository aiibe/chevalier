// Discover island sources on disk to seed client build inputs / dev URLs.

import { isIsland, islandId, normalizePath } from "../islands.ts";

export function inputKey(entry: string): string {
  const base = entry.slice(entry.lastIndexOf("/") + 1);
  return base.replace(/\.[^.]+$/, "") || base;
}

/**
 * Discover island sources under `root`, returning id → app-root-relative path.
 * Seeds the client build inputs so each island code-splits into its own chunk.
 */
export function discoverIslands(
  root: string,
  appRootRel: string,
): Record<string, string> {
  const walk = (dir: string): string[] => {
    const out: string[] = [];
    let entries: Iterable<Deno.DirEntry>;
    try {
      entries = Deno.readDirSync(dir);
    } catch {
      return out; // dir missing → no inputs
    }
    for (const entry of entries) {
      const p = `${dir}/${entry.name}`;
      if (entry.isDirectory) out.push(...walk(p));
      else out.push(p);
    }
    return out;
  };

  const map: Record<string, string> = {};
  for (const abs of walk(root)) {
    const rel = normalizePath(abs.slice(root.length + 1));
    if (!isIsland(rel)) continue;
    map[islandId(rel)] = `${appRootRel}/${rel}`;
  }
  return map;
}
