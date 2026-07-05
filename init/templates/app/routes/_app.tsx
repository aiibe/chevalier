// The app shell: the one document wrapping every page. Layouts and the page
// nest inside <body> as {children}.

import { Head, type LayoutProps } from "chevalier";

export default function App({ children }: LayoutProps) {
  return (
    <html lang="en">
      <Head>
        <title>Chevalier app</title>
        <link rel="icon" href="/favicon.png" type="image/png" />
      </Head>
      <body class="mx-auto max-w-2xl p-8 text-gray-800">
        {children}
      </body>
    </html>
  );
}
