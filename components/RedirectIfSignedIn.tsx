"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/lib/session";

/** Sends logged-in users somewhere else (e.g. from the landing page to their briefing). */
export function RedirectIfSignedIn({ to }: { to: string }) {
  const router = useRouter();
  const signedIn = useSession((s) => s.status === "signedIn");
  useEffect(() => {
    if (signedIn) router.replace(to);
  }, [signedIn, to, router]);
  return null;
}
