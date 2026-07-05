// Default HTML shell. Renders {children} — the server-built page body, which
// carries the boot <script>; apps overriding this just place it in a shell.

import { createContext, Fragment, type VNode } from "preact";
import { useContext } from "preact/hooks";
import type { StyleEntry } from "./manifest.ts";
import { pushHead } from "./registry.tsx";

// Carries the app's resolved stylesheets to <Head>/<Stylesheets> so layouts
// don't thread a `styles` prop. The server wraps the doc in StylesProvider.
const StylesContext = createContext<StyleEntry[]>([]);

// Page <PageHead> vnodes, threaded from the server to <Head> in the shell.
// Pages don't read this — they push via pushHead.
const PageHeadContext = createContext<VNode[]>([]);

/**
 * Server-side: wraps the rendered document so <Head>/<Stylesheets> can read
 * the app's `styles` and the page-contributed `pageHead` from context.
 */
export function StylesProvider(
  { styles, pageHead = [], children }: {
    styles: StyleEntry[];
    pageHead?: VNode[];
    children: VNode;
  },
): VNode {
  return (
    <StylesContext.Provider value={styles}>
      <PageHeadContext.Provider value={pageHead}>
        {children}
      </PageHeadContext.Provider>
    </StylesContext.Provider>
  );
}

// Whether page-head vnodes carry a <title>, so a page <title> drops the shell's
// default. Pages push Fragment-wrapped children, so descend Fragments/arrays.
function hasTitle(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(hasTitle);
  if (!node || typeof node !== "object") return false;
  const v = node as VNode;
  if (v.type === "title") return true;
  if (v.type === Fragment) {
    return hasTitle((v.props as { children?: unknown })?.children);
  }
  return false;
}

// Drops any <title> from the shell's children so a page-contributed <title>
// wins without emitting a duplicate. Mirrors hasTitle's Fragment/array descent.
function stripTitle(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripTitle);
  if (!node || typeof node !== "object") return node;
  const v = node as VNode;
  if (v.type === "title") return null;
  if (v.type === Fragment) {
    const kids = (v.props as { children?: unknown })?.children;
    return <>{stripTitle(kids)}</>;
  }
  return node;
}

/** Props for the app shell (_app.tsx) and for body-only _layout.tsx files. */
export interface LayoutProps {
  /** What this shell/layout wraps: the next layout, or the server-built page body. */
  children: VNode;
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
 * Renders the app's stylesheets in <head>, read from StylesContext. A build
 * emits a hashed .css (plain <link>). Dev pairs a render-blocking <link
 * ...?direct> (raw CSS, no FOUC on navigation) with a <script> module for
 * HMR — see StyleEntry.
 */
export function Stylesheets(): VNode {
  const resolved = useContext(StylesContext);
  return (
    <>
      {resolved.map((s) =>
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

/**
 * Page-side: contributes tags to <head> from anywhere in a page's JSX (a
 * <title>, meta, links). The children are teleported into the shell's <Head>,
 * so this renders nothing in place. A page <title> overrides the shell default.
 */
export function PageHead(
  { children }: { children?: VNode | VNode[] },
): null {
  if (children) pushHead(<>{children}</>);
  return null;
}

/**
 * The app shell's <head>: charset + viewport meta, the app's <Stylesheets>,
 * `children` (favicon, a default <title>, extra meta), then any tags pages
 * contributed via <PageHead>. A page <title> drops a <title> in `children`, so
 * put the app-wide default title in `children`. Renders the <head> element
 * itself — drop it directly under <html> in _app.tsx (or the built-in App).
 */
export function Head(
  { children }: { children?: VNode | VNode[] },
): VNode {
  const pageHead = useContext(PageHeadContext);
  const shellHead = hasTitle(pageHead) ? stripTitle(children) : children;
  return (
    <head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <Stylesheets />
      {shellHead as VNode}
      {pageHead}
    </head>
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
