// Per-directory layout for /admin: the nearest _layout fully replaces the root
// shell (no composition), so it must render the whole document — Stylesheets +
// {children} — itself.

import { type LayoutProps, Stylesheets } from "chevalier";

export default function AdminLayout(
  { children, styles }: LayoutProps,
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
        {children}
      </body>
    </html>
  );
}
