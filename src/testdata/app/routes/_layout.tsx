import type { LayoutProps } from "../../../mod.ts";

export default function Layout({ children }: LayoutProps) {
  return <main class="fixture-layout">{children}</main>;
}
