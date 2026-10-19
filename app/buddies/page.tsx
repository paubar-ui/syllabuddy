import type { Metadata } from "next";
import { ComingSoon } from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Study buddies" };

export default function BuddiesPage() {
  return <ComingSoon title="Study buddies" text="Compete with friends on a weekly leaderboard — coming soon." />;
}
