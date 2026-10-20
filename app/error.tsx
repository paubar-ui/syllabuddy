"use client";
// Friendly fallback when a page crashes. Offers a retry, a way home and — as a last resort —
// clearing saved data (in case something stored in this browser is broken).
import Link from "next/link";
import { useEffect, useState } from "react";
import { Tick } from "@/components/Tick";
import { buttonLink, buttonPrimary, buttonSecondary } from "@/components/ui";

export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="main" className="mx-auto w-full max-w-xl flex-1 px-4 py-12 pb-28 text-center md:pb-12">
      <Tick size={96} className="mx-auto" />
      <h1 className="mt-4 text-2xl font-bold">Oops — something went wrong</h1>
      <p className="mt-2 text-muted">
        Tick tripped over something. Your plan is still saved in this browser. Try again, or head back to today.
      </p>
      <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <button type="button" onClick={() => retry()} className={buttonPrimary}>
          Try again
        </button>
        <Link href="/today" className={buttonSecondary}>
          Go to today
        </Link>
      </div>

      <div className="mt-10 text-sm text-muted">
        {!confirmClear ? (
          <button type="button" onClick={() => setConfirmClear(true)} className={buttonLink}>
            Still broken? Start fresh…
          </button>
        ) : (
          <div role="alert" className="rounded-xl bg-danger-soft p-4 text-left">
            <p className="font-medium text-danger">
              This deletes your saved plan, courses and points from this browser so the app can start clean. It
              can&apos;t be undone.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-full bg-danger px-5 py-2.5 font-semibold text-surface"
                onClick={() => {
                  try {
                    window.localStorage.removeItem("syllabuddy");
                  } catch {
                    // Storage blocked: nothing to clear.
                  }
                  // A full reload on purpose: the in-memory store must start clean too.
                  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                  window.location.href = "/";
                }}
              >
                Yes, start fresh
              </button>
              <button type="button" onClick={() => setConfirmClear(false)} className={buttonSecondary}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
