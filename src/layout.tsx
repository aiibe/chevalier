// Default HTML shell + body-only layout. The shell renders {children} — the
// server-built page body, which carries the boot <script>. <head> machinery
// (Head/Stylesheets/PageHead/StylesProvider) lives in head.tsx.

import type { VNode } from "preact";
import { Head } from "./head.tsx";

/** The current route, passed to every layout and the app shell (see render.ts). */
export interface RouteContext {
  /** Request path, e.g. "/admin/users" — for active-nav matching. */
  url: string;
  /** Matched route pattern, e.g. "/admin/:id"; undefined on a 404/error render. */
  path: string | undefined;
  /** The same `{ params, ...loaderData }` object the page receives. */
  data: Record<string, unknown>;
}

/** Props for the app shell (_app.tsx) and for body-only _layout.tsx files. */
export interface LayoutProps {
  /** What this shell/layout wraps: the next layout, or the server-built page body. */
  children: VNode;
  /** The current route: request path, matched pattern, loader data. */
  route: RouteContext;
}

// dangerouslySetInnerHTML is safe: html/boot are the framework's own SSR output,
// `<`-escaped by buildBoot, never request input. boot "" (no islands) → no <script>.
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
 * The built-in app shell (document): <html>/<head>/<body> with <Head>.
 * One per app, wrapping every page. Override it with app/routes/_app.tsx; a
 * page's <PageHead> and layouts (_layout.tsx) compose inside it.
 */
export function App({ children }: LayoutProps): VNode {
  return (
    <html lang="en">
      <Head>
        <title>Chevalier</title>
      </Head>
      <body>
        {children}
      </body>
    </html>
  );
}

/**
 * The built-in body-only layout: a pass-through. Real apps define their own
 * _layout.tsx (site nav, sidebar) that wraps {children}; layouts nest
 * outer→inner inside the app shell. This default just renders the page.
 */
export function Layout({ children }: LayoutProps): VNode {
  return <>{children}</>;
}

export default App;
