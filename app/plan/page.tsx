import type { Metadata } from "next";
import { ComingSoon } from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Plan" };

export default function PlanPage() {
  return <ComingSoon title="Plan" text="Your week view, semester workload heatmap and calendar export are coming soon." />;
}
