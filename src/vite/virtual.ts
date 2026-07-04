// Source generators for chevalier's virtual modules: the SSR app, the build
// manifest, and the island id → dev-URL map. Kept pure (string in, string out)
// so the plugin's load() stays a thin dispatcher and this is unit-testable.

import { MANIFEST_PATH } from "../manifest.ts";

/** Single-instance convention pages (app-root only): source file → option key. */
const CONVENTION_PAGES: ReadonlyArray<readonly [string, string]> = [
  ["_404", "notFound"],
  ["_error", "error"],
];

/**
 * The whole SSR app, so an app needs no server.ts. The routes glob must be a
 * literal Vite can statically replace, so it lives here (not in defineApp); the
 * convention pages are auto-discovered from disk (each is opt-in).
 */
export function generateApp(
  appRootRel: string,
  root: string,
  ids: { islands: string; manifest: string },
): string {
  const base = `/${appRootRel}/routes`;
  // Exclude _* files: globbing them dynamically while we also static-import them
  // warns (INEFFECTIVE_DYNAMIC_IMPORT); the router discards them regardless.
  const glob = `import.meta.glob([${
    JSON.stringify(`${base}/**/*.{tsx,jsx,ts}`)
  }, ${JSON.stringify(`!${base}/**/_*`)}])`;
  // Separate globs for the per-directory _middleware / _layout convention files,
  // which the routes glob excludes; the router filters and orders each.
  const mwGlob = `import.meta.glob(${
    JSON.stringify(`${base}/**/_middleware.{ts,tsx,js,jsx}`)
  })`;
  const layoutGlob = `import.meta.glob(${
    JSON.stringify(`${base}/**/_layout.{tsx,jsx}`)
  })`;

  const lines = [
    `import { defineApp } from "chevalier";`,
    `import { urls as devIslandUrls } from ${JSON.stringify(ids.islands)};`,
    `import { manifest } from ${JSON.stringify(ids.manifest)};`,
  ];
  const fields = ["devIslandUrls", "manifest"];
  for (const [file, key] of CONVENTION_PAGES) {
    const rel = `${appRootRel}/routes/${file}.tsx`;
    if (!existsSync(`${root}/${rel}`)) continue;
    lines.push(`import ${key} from "/${rel}";`);
    fields.push(key);
  }
  lines.push(
    `export default defineApp({ routes: ${glob}, middleware: ${mwGlob}, layouts: ${layoutGlob}, ${
      fields.join(", ")
    } });`,
  );
  return lines.join("\n");
}

/**
 * Inline the manifest only in the SSR build; the client build has already
 * written it to disk. Dev + client build resolve to undefined.
 */
export function generateManifest(isSsrBuild: boolean, root: string): string {
  if (!isSsrBuild) return `export const manifest = undefined;`;
  const json = Deno.readTextFileSync(`${root}/${MANIFEST_PATH}`);
  return `export const manifest = ${json};`;
}

/**
 * Island id → dev-URL literal. Dev-only; a build resolves URLs from the
 * manifest via resolveIslandUrl.
 */
export function generateIslandUrls(
  islands: Record<string, unknown>,
  islandPrefix: string,
): string {
  const urls: Record<string, string> = {};
  for (const id of Object.keys(islands)) {
    urls[id] = `/@id/${islandPrefix}${id}`;
  }
  return `export const urls = ${JSON.stringify(urls)};`;
}

function existsSync(path: string): boolean {
  try {
    Deno.statSync(path);
    return true;
  } catch {
    return false;
  }
}
