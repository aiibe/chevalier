// Root layout: body-only site chrome, nested inside the app shell (_app.tsx);
// a nested _layout wraps this one's {children}. Editing forces a full reload.

import type { LayoutProps } from "chevalier";

const links = [
  ["/", "home"],
  ["/about", "about"],
  ["/guestbook", "guestbook"],
  ["/admin", "admin"],
];

export default function Layout({ children, route }: LayoutProps) {
  return (
    <>
      <nav class="mb-8 flex gap-3 text-sm text-gray-500">
        {links.map(([href, label]) => (
          <a
            key={href}
            href={href}
            aria-current={route.url === href ? "page" : undefined}
            class={route.url === href
              ? "text-gray-900 font-medium"
              : "hover:text-gray-900"}
          >
            {label}
          </a>
        ))}
      </nav>
      {children}
    </>
  );
}
