// Document rendering: layout resolution/caching + the two-pass island collect
// that builds the final HTML shell. Split out of server.ts so the render
// pipeline is independently testable; createApp keeps only the Hono wiring.

import type { Context } from "hono";
import type { ComponentType, VNode } from "preact";
import { h } from "preact";
import { renderToString } from "preact-render-to-string";
import { type Layout, type LayoutModule, resolveLayouts } from "./router.ts";
import {
  Layout as DefaultLayout,
  type LayoutProps,
  PageBody,
} from "./layout.tsx";
import { StylesProvider } from "./head.tsx";
import { buildBoot } from "./boot.ts";
import { collectIslands } from "./registry.tsx";
import type { StyleEntry } from "./manifest.ts";

/** Resolved inputs the render pipeline closes over (see createApp). */
export interface RendererDeps {
  /** Ancestor layouts for a request path, outer→inner (from createLayouts). */
  layouts: Layout[];
  /** The app shell (_app.tsx default export, or the built-in App). */
  AppShell: ComponentType<LayoutProps>;
  /** id → client URL for every island (dev URL, or hashed chunk for a build). */
  islandUrls: Record<string, string>;
  /** Client-entry URL the per-page boot imports hydrateIslands from. */
  clientEntry: string;
  /** Resolved stylesheets, provided to <Head>/<Stylesheets> via context. */
  styles: StyleEntry[];
}

export interface Renderer {
  /** Resolve a route path to its ancestor layout components, outer→inner. */
  loadLayouts: (routePath: string) => Promise<ComponentType<LayoutProps>[]>;
  /** Two-pass render: collect islands + HTML, then render the shell + boot. */
  renderDoc: (
    Layouts: ComponentType<LayoutProps>[],
    Page: ComponentType<Record<string, unknown>>,
    props: Record<string, unknown>,
    nonce?: string,
  ) => string;
  /**
   * Reads the key Hono's `secureHeaders` middleware sets, so a `script-src
   * 'nonce-…'` directive matches the value stamped on the boot <script>.
   */
  readNonce: (c: Context) => string | undefined;
}

export function createRenderer(deps: RendererDeps): Renderer {
  const { layouts, AppShell, islandUrls, clientEntry, styles } = deps;

  // Resolve a route path to its ancestor layout components, outer→inner, each
  // loaded + cached. They nest inside the app shell; empty → page renders bare.
  const layoutCache = new Map<string, ComponentType<LayoutProps>>();
  const loadLayouts = (
    routePath: string,
  ): Promise<ComponentType<LayoutProps>[]> =>
    Promise.all(
      resolveLayouts(routePath, layouts).map(async (match) => {
        let Layout = layoutCache.get(match.file);
        if (!Layout) {
          Layout = ((await match.load() as LayoutModule).default ??
            DefaultLayout) as ComponentType<LayoutProps>;
          layoutCache.set(match.file, Layout);
        }
        return Layout;
      }),
    );

  // Two-pass: collect islands + HTML, then render the shell with the boot script.
  // Layouts nest outer→inner inside the app shell, wrapping the page body.
  const renderDoc = (
    Layouts: ComponentType<LayoutProps>[],
    Page: ComponentType<Record<string, unknown>>,
    props: Record<string, unknown>,
    nonce?: string,
  ): string => {
    const { html, ids, props: islandProps, head: pageHead } = collectIslands(
      () => renderToString(h(Page, props) as VNode),
    );
    const boot = buildBoot(ids, islandProps, islandUrls, clientEntry);
    // Wrap the page body in each layout inner→outer, then the app shell.
    const body = Layouts.reduceRight(
      (children, Layout) =>
        h(Layout, { children } satisfies LayoutProps) as VNode,
      h(PageBody, { html, boot, nonce }) as VNode,
    );
    const doc = h(StylesProvider, {
      styles,
      pageHead,
      children: h(AppShell, { children: body } satisfies LayoutProps) as VNode,
    }) as VNode;
    return "<!DOCTYPE html>" + renderToString(doc);
  };

  const readNonce = (c: Context): string | undefined =>
    (c.get as (k: string) => unknown)("secureHeadersNonce") as
      | string
      | undefined;

  return { loadLayouts, renderDoc, readNonce };
}
