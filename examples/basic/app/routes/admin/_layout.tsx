// Per-directory layout for /admin. Body-only and nests inside the root
// _layout: admin pages get the site nav (root layout) then this admin sub-nav.

import type { LayoutProps } from "chevalier";

export default function AdminLayout({ children }: LayoutProps) {
  return (
    <section class="rounded-lg bg-gray-900 p-6 text-gray-100">
      <nav class="mb-6 flex gap-3 text-sm text-gray-400">
        <a class="hover:text-white" href="/admin">admin</a>
      </nav>
      {children}
    </section>
  );
}
