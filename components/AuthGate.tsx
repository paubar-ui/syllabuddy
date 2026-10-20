"use client";
// Protects every page of the app: you need to be logged in, and your plan has to be loaded
// from your account before the page shows. Public pages: /, /login, /signup (and 404s).
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { CalendarAutoSync } from "@/components/CalendarAutoSync";
import { useSession } from "@/lib/session";

const PROTECTED = ["/app", "/today", "/plan", "/courses", "/focus", "/panic", "/settings", "/onboarding", "/buddies", "/exam"];

export const isProtectedPath = (path: string) =>
  PROTECTED.some((p) => path === p || path.startsWith(`${p}/`));

export function AuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const status = useSession((s) => s.status);
  const plan = useSession((s) => s.plan);
  const needsLogin = isProtectedPath(pathname);

  useEffect(() => {
    if (needsLogin && status === "signedOut") router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [needsLogin, status, pathname, router]);

  if (!needsLogin) return <>{children}</>;
  if (status === "signedIn" && plan === "ready") {
    return (
      <>
        <CalendarAutoSync />
        {children}
      </>
    );
  }

  return (
    <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 pb-28 md:pb-10" aria-busy="true">
      <p className="text-muted">
        {plan === "error"
          ? "Couldn't load your plan — check your internet connection and refresh the page."
          : status === "signedOut"
            ? "Taking you to the login page…"
            : "Loading your plan…"}
      </p>
    </main>
  );
}
