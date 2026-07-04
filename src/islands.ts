// Island detection. Path is the single source of truth — no
// explicit island() wrapper. Matched relative to the app root (`app/`),
// case-sensitive, POSIX separators.

// A component (island/JSX page) must carry JSX; a route module also allows a
// plain `.ts`/`.js` handler. Single-sourced so the two rules can't drift.
const COMPONENT_EXT = "tsx|jsx";
const ROUTE_EXT = "tsx|jsx|ts|js";
export const COMPONENT_EXT_RE = new RegExp(`\\.(${COMPONENT_EXT})$`);
export const ROUTE_EXT_RE = new RegExp(`\\.(${ROUTE_EXT})$`);
const ISLAND_RE = new RegExp(`(?:^|/)islands/.+\\.(${COMPONENT_EXT})$`);
export const TEST_SPEC_RE = new RegExp(`\\.(test|spec)\\.(${ROUTE_EXT})$`);

/** Drop a leading `./` or `/` so a path is root-relative. */
export function stripLead(p: string): string {
  return p.replace(/^\.?\//, "");
}

export function normalizePath(p: string): string {
  return stripLead(p.replace(/\\/g, "/"));
}

function basename(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? p : p.slice(i + 1);
}

/**
 * True iff `path` (app-root-relative) is an island: any `.tsx`/`.jsx` under
 * `islands/` (reserved at any depth). Exclusions take precedence.
 */
export function isIsland(path: string): boolean {
  const p = normalizePath(path);
  if (isExcluded(p)) return false;
  return ISLAND_RE.test(p);
}

/** True iff `path` (app-root-relative) is a per-directory `_middleware` file. */
export function isMiddleware(path: string): boolean {
  return /(^|\/)_middleware\.[^/]+$/.test(normalizePath(path));
}

/** True iff `path` (app-root-relative) is a per-directory `_layout` file. */
export function isLayout(path: string): boolean {
  return /(^|\/)_layout\.[^/]+$/.test(normalizePath(path));
}

/** Excluded files — never islands even under islands/. */
export function isExcluded(path: string): boolean {
  const p = normalizePath(path);
  const name = basename(p);
  if (name.startsWith("_")) return true; // _layout, _404, ...
  if (TEST_SPEC_RE.test(name)) return true;
  if (name.endsWith(".d.ts")) return true;
  if (!COMPONENT_EXT_RE.test(name)) return true; // only components qualify
  return false;
}

/**
 * Stable island id from an app-root-relative path: drop the extension.
 * `islands/counter.tsx` → `islands/counter`.
 * Used as the hydration marker and client-bundle key.
 */
export function islandId(path: string): string {
  return normalizePath(path).replace(COMPONENT_EXT_RE, "");
}
