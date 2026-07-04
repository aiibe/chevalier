// App-level layout override. Changing this file forces a full reload
// (affects the document shell), like routes and islands.
// `boot` is "" for a page with no islands, shipping zero client JS.

import { type LayoutProps, Stylesheets } from "chevalier";

export default function Layout(
  { childrenHtml, boot = "", nonce, styles }: LayoutProps,
) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.png" type="image/png" />
        <Stylesheets styles={styles} />
        <title>Chevalier — basic</title>
      </head>
      <body class="mx-auto max-w-2xl p-8 font-sans text-gray-800">
        <nav class="mb-8 flex gap-3 text-sm text-gray-500">
          <a class="hover:text-gray-900" href="/">home</a>
          <a class="hover:text-gray-900" href="/about">about</a>
          <a class="hover:text-gray-900" href="/guestbook">guestbook</a>
        </nav>
        <main
          id="chevalier-root"
          dangerouslySetInnerHTML={{ __html: childrenHtml }}
        />
        {boot
          ? (
            <script
              type="module"
              nonce={nonce}
              dangerouslySetInnerHTML={{ __html: boot }}
            />
          )
          : null}
      </body>
    </html>
  );
}
