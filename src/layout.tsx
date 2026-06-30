// Default HTML shell layout. Wraps pre-rendered page HTML in the document shell
// and injects the per-page boot module that hydrates only this page's islands.
// Apps may override this with their own `app/routes/_layout.tsx`.
// `boot` is "" for a page with no islands, so the <script> is omitted entirely.

import type { VNode } from "preact";

export interface LayoutProps {
  /** Pre-rendered inner page HTML, injected raw via dangerouslySetInnerHTML. */
  childrenHtml: string;
  /** Generated boot module source; "" for a page with no islands. */
  boot?: string;
  title?: string;
  head?: VNode | VNode[];
}

export function Layout(
  { childrenHtml, boot = "", title = "Chevalier", head }: LayoutProps,
): VNode {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        {head}
      </head>
      <body>
        <div
          id="chevalier-root"
          dangerouslySetInnerHTML={{ __html: childrenHtml }}
        />
        {boot
          ? (
            <script
              type="module"
              dangerouslySetInnerHTML={{ __html: boot }}
            />
          )
          : null}
      </body>
    </html>
  );
}

export default Layout;
