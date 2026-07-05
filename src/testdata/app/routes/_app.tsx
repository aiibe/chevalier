import { Head, type LayoutProps } from "../../../mod.ts";

export default function App({ children }: LayoutProps) {
  return (
    <html lang="en">
      <Head>
        <title>Fixture</title>
      </Head>
      <body data-shell="fixture">{children}</body>
    </html>
  );
}
