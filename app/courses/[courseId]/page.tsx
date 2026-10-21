import type { Metadata } from "next";
import { Suspense } from "react";
import { CourseFolderView } from "@/components/courses/CourseFolderView";

export const metadata: Metadata = { title: "Course" };

export default function CoursePage() {
  return (
    <Suspense fallback={<main id="main" className="flex-1 px-4 py-6">Loading…</main>}>
      <CourseFolderView />
    </Suspense>
  );
}
