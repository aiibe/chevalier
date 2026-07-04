// Map a changed file to a reload strategy, and invalidate stale SSR modules.

import { isIsland, isMiddleware, normalizePath, stripLead } from "../islands.ts";

/** App-root-relative path for `file`, or null if it's outside the app root. */
export function appRel(file: string, appRoot: string): string | null {
  const p = normalizePath(file).replace(/[?#].*$/, ""); // Vite query suffix
  const root = normalizePath(appRoot);
  if (p.includes(`/${root}/`)) {
    return p.slice(p.indexOf(`/${root}/`) + root.length + 2);
  }
  if (p.startsWith(root + "/")) return p.slice(root.length + 1);
  return null;
}

// "route" reloads only matching browsers; "broadcast" reloads all because a
// _layout / _middleware wraps many routes and can't be cheaply mapped to one URL.
export type ReloadKind = "route" | "broadcast" | null;

export function reloadKind(
  file: string,
  appRoot: string,
): { kind: ReloadKind; rel: string | null } {
  const rel = appRel(file, appRoot);
  if (rel === null || isIsland(rel)) return { kind: null, rel };
  if (rel.includes("_layout") || isMiddleware(rel)) {
    return { kind: "broadcast", rel };
  }
  if (rel.startsWith("routes/")) return { kind: "route", rel };
  return { kind: null, rel };
}

// Minimal structural view of Vite's SSR EnvironmentModuleGraph — avoids
// depending on the concrete type across Deno's split node_modules trees.
type SsrModule = { importers: Iterable<SsrModule> };
export interface SsrModuleGraph {
  getModuleById(id: string): SsrModule | undefined;
  getModulesByFile(file: string): Set<SsrModule> | undefined;
  invalidateModule(mod: SsrModule): void;
  onFileDelete(file: string): void;
}

// Re-transform an island's SSR module and every SSR module that imports it, so a
// changed/removed nested-island import doesn't linger in the importer's graph.
export function invalidateSsrImporters(
  ssr: SsrModuleGraph,
  file: string,
): void {
  for (const mod of ssr.getModulesByFile(file) ?? []) {
    for (const importer of mod.importers) ssr.invalidateModule(importer);
    ssr.invalidateModule(mod);
  }
}
