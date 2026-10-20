"use client";
// Friendly fallback when a page crashes: try again, or go back to the app.
import Link from "next/link";
import { useEffect } from "react";
import { Tick } from "@/components/Tick";
import { buttonPrimary, buttonSecondary } from "@/components/ui";

export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="main" className="mx-auto w-full max-w-xl flex-1 px-4 py-12 pb-28 text-center md:pb-12">
      <Tick size={48} className="mx-auto" />
      <h1 className="mt-4 text-2xl font-semibold">Oops — something went wrong</h1>
      <p className="mt-2 text-muted">
        Something went wrong on our side. Your plan is safe in your account. Try again, or head back to today.
      </p>
      <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <button type="button" onClick={() => retry()} className={buttonPrimary}>
          Try again
        </button>
        <Link href="/app" className={buttonSecondary}>
          Go to today
        </Link>
      </div>
    </main>
  );
}
