import type { Metadata } from "next";
import { Suspense } from "react";
import { FocusView } from "@/components/focus/FocusView";

export const metadata: Metadata = { title: "Focus" };

export default function FocusPage() {
  return (
    <Suspense fallback={<main id="main" className="flex-1 px-4 py-6">Loading…</main>}>
      <FocusView />
    </Suspense>
  );
}
