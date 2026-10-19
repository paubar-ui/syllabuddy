import type { Metadata } from "next";
import { ComingSoon } from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Courses" };

export default function CoursesPage() {
  return <ComingSoon title="Courses" text="Editing courses, marking work done and the grade calculator are coming soon." />;
}
