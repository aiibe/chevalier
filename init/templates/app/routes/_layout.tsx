import type { LayoutProps } from "chevalier";

// `boot` is "" for a page with no islands, shipping zero client JS.
export default function Layout(
  { childrenHtml, boot = "", nonce }: LayoutProps,
) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.png" type="image/png" />
        <title>Chevalier app</title>
      </head>
      <body>
        <nav>
          <a href="/">home</a> · <a href="/about">about</a> ·{" "}
          <a href="/greet">greet</a>
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
