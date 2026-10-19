import type { Metadata } from "next";
import { PanicView } from "@/components/panic/PanicView";

export const metadata: Metadata = { title: "Panic mode" };

export default function PanicPage() {
  return <PanicView />;
}
