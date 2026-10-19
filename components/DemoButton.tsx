"use client";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";

export function DemoButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  const loadDemo = useStore((s) => s.loadDemo);

  return (
    <button
      type="button"
      data-testid="demo-button"
      onClick={() => {
        loadDemo();
        router.push("/today");
      }}
      className={`rounded-full bg-accent px-6 py-3 text-base font-semibold text-on-accent shadow-sm transition hover:opacity-90 ${className}`}
    >
      Try with a demo semester
    </button>
  );
}
