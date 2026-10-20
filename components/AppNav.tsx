"use client";
// Top bar on every page (logo, and Log out when you're logged in — grading contract),
// plus the page links: in the top bar on laptops, as a bottom tab bar on phones.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { logOut } from "@/lib/auth";
import { useSession } from "@/lib/session";
import { isProtectedPath } from "./AuthGate";
import { Tick } from "./Tick";

const ITEMS = [
  { href: "/app", label: "Today", icon: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" },
  { href: "/plan", label: "Plan", icon: "M8 3v3m8-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" },
  { href: "/courses", label: "Courses", icon: "M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2V5Zm0 14a2 2 0 0 1 2-2h12" },
  { href: "/buddies", label: "Buddies", icon: "M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1m18 0v-1a4 4 0 0 0-3-3.9M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm6-6.9a3.5 3.5 0 0 1 0 6.8" },
];

export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const status = useSession((s) => s.status);
  const [busy, setBusy] = useState(false);
  const signedIn = status === "signedIn";

  const links = (variant: "top" | "bottom") =>
    ITEMS.map((item) => {
      const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
      return (
        <li key={item.href} className={variant === "bottom" ? "flex-1" : ""}>
          <Link
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-0.5 rounded-xl px-3 py-2 text-xs font-medium ${
              variant === "bottom" ? "flex-col" : "gap-2 text-sm"
            } ${active ? "bg-accent-soft text-ink" : "text-muted hover:text-ink"}`}
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
      <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-2">
          <Link href={signedIn ? "/app" : "/"} className="flex items-center gap-2 font-semibold">
            <Tick size={32} />
            Syllabuddy
          </Link>

          {signedIn && (
            <div className="flex items-center gap-1">
              <nav aria-label="Main" className="hidden md:block">
                <ul className="flex gap-1">{links("top")}</ul>
              </nav>
              <Link
                href="/settings"
                aria-current={pathname === "/settings" ? "page" : undefined}
                className={`rounded-xl px-3 py-2 text-sm font-medium ${
                  pathname === "/settings" ? "bg-accent-soft text-ink" : "text-muted hover:text-ink"
                }`}
              >
                <span aria-hidden="true">⚙</span>
                <span className="sr-only md:not-sr-only md:ml-1">Settings</span>
              </Link>
              <button
                type="button"
                data-testid="logout"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await logOut();
                  setBusy(false);
                  router.push("/");
                }}
                className="rounded-full border border-line px-3 py-1.5 text-sm font-semibold hover:bg-accent-soft"
              >
                {busy ? "Logging out…" : "Log out"}
              </button>
            </div>
          )}

          {status === "signedOut" && (
            <nav aria-label="Account" className="flex items-center gap-3 text-sm font-semibold">
              {pathname !== "/login" && (
                <Link href="/login" className="text-accent underline underline-offset-2 hover:no-underline">
                  Log in
                </Link>
              )}
              {pathname === "/login" && (
                <Link href="/signup" className="text-accent underline underline-offset-2 hover:no-underline">
                  Sign up
                </Link>
              )}
            </nav>
          )}
        </div>
      </header>

      {signedIn && isProtectedPath(pathname) && (
        <nav
          aria-label="Main"
          className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        >
          <ul className="mx-auto flex max-w-md px-2 py-1">{links("bottom")}</ul>
        </nav>
      )}
    </>
  );
}
