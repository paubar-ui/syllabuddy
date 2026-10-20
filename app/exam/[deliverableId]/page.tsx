import type { Metadata } from "next";
import { Suspense } from "react";
import { ExamPrepView } from "@/components/exam/ExamPrepView";

export const metadata: Metadata = { title: "Exam prep" };

export default function ExamPage() {
  return (
    <Suspense fallback={<main id="main" className="flex-1 px-4 py-6">Loading…</main>}>
      <ExamPrepView />
    </Suspense>
  );
}
