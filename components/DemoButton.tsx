"use client";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { buttonPrimary, buttonSecondary } from "./ui";

/** Fills your account with four sample courses (only offered while your plan is empty). */
export function DemoButton({
  className = "",
  label = "Try with a demo semester",
  variant = "primary",
}: {
  className?: string;
  label?: string;
  variant?: "primary" | "secondary";
}) {
  const router = useRouter();
  const loadDemo = useStore((s) => s.loadDemo);

  return (
    <button
      type="button"
      data-testid="demo-button"
      onClick={() => {
        loadDemo();
        router.push("/app");
      }}
      className={`${variant === "primary" ? buttonPrimary : buttonSecondary} ${className}`}
    >
      {label}
    </button>
  );
}
