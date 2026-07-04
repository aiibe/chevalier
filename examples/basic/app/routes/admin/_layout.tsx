// Per-directory layout: the nearest _layout wins and fully replaces the root
// shell for /admin and everything under it — a distinct admin chrome. A layout
// is a full document shell, so it must render Stylesheets + the boot <script>
// itself; omitting `boot` means islands under /admin never hydrate.

import { type LayoutProps, Stylesheets } from "chevalier";

export default function AdminLayout(
  { childrenHtml, boot = "", nonce, styles }: LayoutProps,
) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.png" type="image/png" />
        <Stylesheets styles={styles} />
        <title>Chevalier — admin</title>
      </head>
      <body class="mx-auto max-w-2xl bg-gray-900 p-8 font-sans text-gray-100">
        <nav class="mb-8 flex gap-3 text-sm text-gray-400">
          <a class="hover:text-white" href="/">← site</a>
          <a class="hover:text-white" href="/admin">admin</a>
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
