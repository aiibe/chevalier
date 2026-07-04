// Vite client-manifest → hashed-asset resolution.

import { stripLead } from "./islands.ts";

/** Chunk `name` of chevalier's client entry; src/vite.ts keys the client input by it. */
export const CLIENT_NAME = "chevalier-client";

// Client manifest, project-root-relative. Convention, not derived: the app's
// client build must use outDir dist/client + manifest:true. Read at SSR-build time.
export const MANIFEST_PATH = "dist/client/.vite/manifest.json";

/** Dev URL of the chevalier client entry (the virtual module Vite serves). */
export const CLIENT_DEV_URL = "/@id/chevalier:client";

/** Root-absolute URL for a manifest chunk file (e.g. "assets/x.js" → "/assets/x.js"). */
function chunkHref(file: string): string {
  return "/" + file.replace(/^\//, "");
}

/** Resolved location of a CSS entry for the layout; see styleUrl. */
export interface StyleEntry {
  href: string;
  /** Dev: a JS module (load via <script type=module>), not a .css <link>. */
  dev: boolean;
}

/**
 * Resolve a CSS entry (e.g. "app/styles.css") for the layout. Dev serves it as
 * a style-injecting JS module, a build emits a hashed .css asset — hence `dev`,
 * which picks <script> vs <link>. Missing build chunk degrades to the dev URL.
 */
export function styleUrl(src: string, manifest?: ViteManifest): StyleEntry {
  const key = stripLead(src);
  const chunk = manifest?.[key];
  if (!chunk) return { href: "/" + key, dev: true };
  return { href: chunkHref(chunk.file), dev: false };
}

export interface ViteManifestChunk {
  /** Emitted file, manifest-root-relative (e.g. "assets/client-Dv3fyGqv.js"). */
  file: string;
  name?: string;
  isEntry?: boolean;
  css?: string[];
}

/** Parsed `.vite/manifest.json`: source key (e.g. "app/client.ts") → chunk. */
export type ViteManifest = Record<string, ViteManifestChunk>;

/**
 * Resolve the client-entry URL the per-page boot imports hydrateIslands from.
 * Build → the chevalier-client chunk located by its manifest `name`. Dev (no
 * manifest) → the virtual module's dev URL. A build that somehow lacks the
 * chunk degrades to the dev URL (visible 404) rather than throwing.
 */
export function resolveClientEntry(manifest?: ViteManifest): string {
  if (!manifest) return CLIENT_DEV_URL;
  for (const chunk of Object.values(manifest)) {
    if (chunk.name === CLIENT_NAME) return chunkHref(chunk.file);
  }
  return CLIENT_DEV_URL;
}

/**
 * Resolve an island id (e.g. "islands/counter") to its hashed build chunk by
 * probing each JSX extension under `appRoot`; null if unresolved (caller falls back to dev URL).
 */
export function resolveIslandUrl(
  id: string,
  manifest: ViteManifest | undefined,
  appRoot = "app",
): string | null {
  if (!manifest) return null;
  const root = stripLead(appRoot).replace(/\/$/, "");
  for (const ext of ["tsx", "jsx"]) {
    const chunk = manifest[`${root}/${id}.${ext}`];
    if (chunk) return chunkHref(chunk.file);
  }
  return null;
}

/** Resolve every dev island URL to its hashed build chunk, falling back to the dev URL if unresolved. */
export function resolveIslandUrls(
  devUrls: Record<string, string>,
  manifest: ViteManifest | undefined,
  appRoot = "app",
): Record<string, string> {
  if (!manifest) return devUrls;
  const out: Record<string, string> = {};
  for (const [id, devUrl] of Object.entries(devUrls)) {
    out[id] = resolveIslandUrl(id, manifest, appRoot) ?? devUrl;
  }
  return out;
}
