// Default HTML shell. Renders {children} — the server-built page body, which
// carries the boot <script>; apps overriding this just place it in a shell.

import type { VNode } from "preact";
import type { StyleEntry } from "./manifest.ts";

export interface LayoutProps {
  /** Server-built page body (page HTML + its boot <script>). Render as {children}. */
  children: VNode;
  /** Resolved stylesheets, from defineApp's `styles`. Render with <Stylesheets>. */
  styles?: StyleEntry[];
  title?: string;
  head?: VNode | VNode[];
}

// The server-built {children}: page HTML + its boot <script> (omitted when
// boot is "" — no islands, zero JS). dangerouslySetInnerHTML is safe: html/boot
// are the framework's own SSR output, `<`-escaped by buildBoot, never request input.
export function PageBody(
  { html, boot = "", nonce }: { html: string; boot?: string; nonce?: string },
): VNode {
  return (
    <>
      <div id="chevalier-root" dangerouslySetInnerHTML={{ __html: html }} />
      {boot
        ? (
          <script
            type="module"
            nonce={nonce}
            dangerouslySetInnerHTML={{ __html: boot }}
          />
        )
        : null}
    </>
  );
}

/**
 * Renders the app's stylesheets in <head>. A build emits a hashed .css (plain
 * <link>). Dev pairs a render-blocking <link ...?direct> (raw CSS, no FOUC on
 * navigation) with a <script> module for HMR — see StyleEntry.
 */
export function Stylesheets({ styles = [] }: { styles?: StyleEntry[] }): VNode {
  return (
    <>
      {styles.map((s) =>
        s.dev
          ? (
            <>
              <link key={s.href} rel="stylesheet" href={`${s.href}?direct`} />
              <script key={`${s.href}#hmr`} type="module" src={s.href} />
            </>
          )
          : <link key={s.href} rel="stylesheet" href={s.href} />
      )}
    </>
  );
}

export function Layout(
  { children, styles, title = "Chevalier", head }: LayoutProps,
): VNode {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Stylesheets styles={styles} />
        <title>{title}</title>
        {head}
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}

export default Layout;
