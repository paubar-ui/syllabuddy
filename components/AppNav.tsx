"use client";
// Top bar on desktop, bottom tab bar on phones. Hidden on the landing page and onboarding.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tick } from "./Tick";

const ITEMS = [
  { href: "/today", label: "Today", icon: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" },
  { href: "/plan", label: "Plan", icon: "M8 3v3m8-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" },
  { href: "/courses", label: "Courses", icon: "M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2V5Zm0 14a2 2 0 0 1 2-2h12" },
  { href: "/buddies", label: "Buddies", icon: "M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1m18 0v-1a4 4 0 0 0-3-3.9M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm6-6.9a3.5 3.5 0 0 1 0 6.8" },
];

const HIDDEN_ON = ["/", "/onboarding"];

export function AppNav() {
  const pathname = usePathname();
  if (HIDDEN_ON.includes(pathname)) return null;

  const links = ITEMS.map((item) => {
    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
    return (
      <li key={item.href} className="flex-1 md:flex-none">
        <Link
          href={item.href}
          aria-current={active ? "page" : undefined}
          className={`flex flex-col items-center gap-0.5 rounded-xl px-3 py-2 text-xs font-medium md:flex-row md:gap-2 md:text-sm ${
            active ? "bg-accent-soft text-ink" : "text-muted hover:text-ink"
          }`}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={active ? "text-accent" : ""}
          >
            <path d={item.icon} />
          </svg>
          {item.label}
        </Link>
      </li>
    );
  });

  return (
    <>
      <header className="sticky top-0 z-20 hidden border-b border-line bg-surface/90 backdrop-blur md:block">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-2">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <Tick size={32} />
            Syllabuddy
          </Link>
          <nav aria-label="Main" className="flex items-center gap-1">
            <ul className="flex gap-1">{links}</ul>
            <Link
              href="/settings"
              aria-current={pathname === "/settings" ? "page" : undefined}
              className={`rounded-xl px-3 py-2 text-sm font-medium ${
                pathname === "/settings" ? "bg-accent-soft text-ink" : "text-muted hover:text-ink"
              }`}
            >
              <span aria-hidden="true">⚙ </span>Settings
            </Link>
          </nav>
        </div>
      </header>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="mx-auto flex max-w-md px-2 py-1">{links}</ul>
      </nav>
    </>
  );
}
