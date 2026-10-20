import type { Metadata } from "next";
import Link from "next/link";
import { Tick } from "@/components/Tick";
import { buttonPrimary, buttonSecondary } from "@/components/ui";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main id="main" className="mx-auto w-full max-w-xl flex-1 px-4 py-12 pb-28 text-center md:pb-12">
      <Tick size={48} className="mx-auto" />
      <p className="mt-4 text-sm font-semibold uppercase tracking-wider text-accent">404</p>
      <h1 className="mt-1 text-2xl font-bold">This page took a day off</h1>
      <p className="mt-2 text-muted">We couldn&apos;t find that page. Let&apos;s get you back on track.</p>
      <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link href="/app" className={buttonPrimary}>
          Go to today
        </Link>
        <Link href="/" className={buttonSecondary}>
          Start page
        </Link>
      </div>
    </main>
  );
}
