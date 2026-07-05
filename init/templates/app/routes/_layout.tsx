import { type LayoutProps, Stylesheets } from "chevalier";

export default function Layout(
  { children, styles }: LayoutProps,
) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.png" type="image/png" />
        <Stylesheets styles={styles} />
        <title>Chevalier app</title>
      </head>
      <body class="mx-auto max-w-2xl p-8 text-gray-800">
        <nav class="mb-8 flex gap-3 text-sm text-gray-500">
          <a class="hover:text-gray-900" href="/">home</a>
          <a class="hover:text-gray-900" href="/about">about</a>
          <a class="hover:text-gray-900" href="/guestbook">guestbook</a>
          <a class="hover:text-gray-900" href="/admin">admin</a>
        </nav>
        {children}
      </body>
    </html>
  );
}
