// Island detection. Path is the single source of truth — no
// explicit island() wrapper. Matched relative to the app root (`app/`),
// case-sensitive, POSIX separators.

export function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.?\//, "");
}

function basename(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? p : p.slice(i + 1);
}

/**
 * True iff `path` (app-root-relative) is an island.
 * Rule A: islands/​**​/*.{tsx,jsx} (recursive, `islands` reserved at any depth).
 * Rule B: routes/​**​/$*.{tsx,jsx} (leading `$` on the filename).
 * Exclusions take precedence over both rules.
 */
export function isIsland(path: string): boolean {
  const p = normalizePath(path);
  if (isExcluded(p)) return false;
  return /(?:^|\/)islands\/.+\.(tsx|jsx)$/.test(p) ||
    /(?:^|\/)routes\/.*\/?\$[^/]+\.(tsx|jsx)$/.test(p);
}

/** Excluded files — never islands even under islands/ or with a $ name. */
export function isExcluded(path: string): boolean {
  const p = normalizePath(path);
  const name = basename(p);
  if (name.startsWith("_")) return true; // _layout, _404, ...
  if (/\.(test|spec)\.(tsx|jsx|ts|js)$/.test(name)) return true;
  if (name.endsWith(".d.ts")) return true;
  if (!/\.(tsx|jsx)$/.test(name)) return true; // only components qualify
  return false;
}

/**
 * Stable island id from an app-root-relative path: drop the extension.
 * `islands/counter.tsx` → `islands/counter`.
 * Used as the hydration marker and client-bundle key.
 */
export function islandId(path: string): string {
  return normalizePath(path).replace(/\.(tsx|jsx)$/, "");
}
