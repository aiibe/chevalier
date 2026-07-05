// Root layout: body-only site chrome, nested inside the app shell (_app.tsx);
// a nested _layout wraps this one's {children}.

import type { LayoutProps } from "chevalier";

export default function Layout({ children }: LayoutProps) {
  return (
    <>
      <nav class="mb-8 flex gap-3 text-sm text-gray-500">
        <a class="hover:text-gray-900" href="/">home</a>
        <a class="hover:text-gray-900" href="/about">about</a>
        <a class="hover:text-gray-900" href="/guestbook">guestbook</a>
        <a class="hover:text-gray-900" href="/admin">admin</a>
      </nav>
      {children}
    </>
  );
}
