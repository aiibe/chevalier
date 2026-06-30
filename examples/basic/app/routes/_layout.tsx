// App-level layout override. Changing this file forces a full reload (PLAN
// §5: affects the document shell), like routes and islands.
// `boot` is "" for a page with no islands, shipping zero client JS.

import type { LayoutProps } from "chevalier";

export default function Layout({ childrenHtml, boot = "" }: LayoutProps) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Chevalier — basic</title>
      </head>
      <body>
        <nav>
          <a href="/">home</a> · <a href="/about">about</a>
        </nav>
        <main
          id="chevalier-root"
          dangerouslySetInnerHTML={{ __html: childrenHtml }}
        />
        {boot
          ? <script type="module" dangerouslySetInnerHTML={{ __html: boot }} />
          : null}
      </body>
    </html>
  );
}
