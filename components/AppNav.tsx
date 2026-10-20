"use client";
// The app frame.
// Logged in: ONE <aside> that is a slim top bar on phones and a left sidebar on laptops — so the
// `logout` button (grading contract) exists exactly once on every page — plus a bottom tab bar on phones.
// Logged out: a simple top bar with "Log in".
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { logOut } from "@/lib/auth";
import { useSession } from "@/lib/session";
import { Tick } from "./Tick";

const ICONS = {
  today: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  plan: "M8 3v3m8-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z",
  courses: "M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2V5Zm0 14a2 2 0 0 1 2-2h12",
  buddies:
    "M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm13 9v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2-1.2L14.5 3h-4l-.4 2.6a7.6 7.6 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7.6 7.6 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z",
};

/** The 5 main destinations; detail pages count as part of their parent. */
const ITEMS = [
  { href: "/app", label: "Today", icon: ICONS.today, also: ["/focus", "/panic"] },
  { href: "/plan", label: "Plan", icon: ICONS.plan, also: [] },
  { href: "/courses", label: "Courses", icon: ICONS.courses, also: ["/onboarding", "/exam"] },
  { href: "/buddies", label: "Study buddies", short: "Buddies", icon: ICONS.buddies, also: [] },
  { href: "/settings", label: "Settings", icon: ICONS.settings, also: [] },
];

function NavIcon({ d }: { d: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const status = useSession((s) => s.status);
  const email = useSession((s) => s.user?.email);
  const saveFailing = useSession((s) => s.saveFailing);
  const [busy, setBusy] = useState(false);
  const signedIn = status === "signedIn";

  const isActive = (item: (typeof ITEMS)[number]) =>
    [item.href, ...item.also].some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!signedIn) {
    return (
      <>
        <header data-print-hide className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <Tick size={24} />
              Syllabuddy
            </Link>
            {status === "signedOut" && (
              <nav aria-label="Account" className="text-sm font-semibold">
                {pathname === "/login" ? (
                  <Link href="/signup" className="text-accent underline underline-offset-2 hover:no-underline">
                    Sign up
                  </Link>
                ) : (
                  <Link href="/login" className="text-accent underline underline-offset-2 hover:no-underline">
                    Log in
                  </Link>
                )}
              </nav>
            )}
          </div>
        </header>
        {children}
      </>
    );
  }

  return (
    <>
      <aside
        data-print-hide
        className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-surface/95 px-4 backdrop-blur md:inset-y-0 md:right-auto md:h-auto md:w-60 md:flex-col md:items-stretch md:justify-start md:border-r md:border-b-0 md:px-3 md:py-5"
      >
        <Link href="/app" className="flex items-center gap-2 font-semibold tracking-tight md:px-2">
          <Tick size={24} />
          Syllabuddy
        </Link>

        <nav aria-label="Main" className="mt-8 hidden md:block">
          <ul className="space-y-1">
            {ITEMS.map((item) => {
              const active = isActive(item);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
                      active ? "bg-accent-soft text-ink" : "text-muted hover:bg-surface-2 hover:text-ink"
                    }`}
                  >
                    <span className={active ? "text-accent" : ""}>
                      <NavIcon d={item.icon} />
                    </span>
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex items-center gap-3 md:mt-auto md:flex-col md:items-stretch md:gap-2 md:border-t md:border-line md:px-2 md:pt-4">
          <Link href="/about" className="hidden text-xs font-medium text-muted hover:text-ink md:block">
            About Syllabuddy
          </Link>
          {email && (
            <p className="hidden truncate text-xs text-muted md:block" title={email}>
              Signed in as
              <br />
              <span className="font-medium text-ink">{email}</span>
            </p>
          )}
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
            className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold hover:bg-surface-2"
          >
            {busy ? "Logging out…" : "Log out"}
          </button>
        </div>
      </aside>

      <nav
        data-print-hide
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="mx-auto flex max-w-md px-2 py-1">
          {ITEMS.map((item) => {
            const active = isActive(item);
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-xs font-medium ${
                    active ? "text-accent" : "text-muted hover:text-ink"
                  }`}
                >
                  <NavIcon d={item.icon} />
                  {item.short ?? item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex min-h-full flex-1 flex-col pt-14 md:pt-0 md:pl-60">{children}</div>

      {saveFailing && (
        <p
          role="status"
          className="fixed inset-x-4 bottom-20 z-40 mx-auto max-w-md rounded-lg border border-warn-line bg-warn-bg px-4 py-2 text-center text-sm font-medium text-warn-ink shadow md:bottom-6"
        >
          Your last change isn&apos;t saved yet — retrying… Check your internet connection.
        </p>
      )}
    </>
  );
}
