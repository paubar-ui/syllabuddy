import type { Metadata } from "next";
import { Landing } from "@/components/Landing";

export const metadata: Metadata = { title: "About Syllabuddy" };

export default function AboutPage() {
  return <Landing />;
}
