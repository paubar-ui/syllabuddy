import type { Metadata } from "next";
import { BuddiesView } from "@/components/buddies/BuddiesView";

export const metadata: Metadata = { title: "Study buddies" };

export default function BuddiesPage() {
  return <BuddiesView />;
}
