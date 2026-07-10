import type { LayoutProps } from "../../../mod.ts";

export default function Layout({ children, route }: LayoutProps) {
  return (
    <main
      class="fixture-layout"
      data-route-url={route.url}
      data-route-path={route.path ?? ""}
      data-route-data={JSON.stringify(route.data)}
    >
      {children}
    </main>
  );
}
