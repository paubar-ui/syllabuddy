"use client";
// The landing page's one main button: "Sign up" for visitors, "Open my plan" when logged in.
import Link from "next/link";
import { useSession } from "@/lib/session";
import { buttonPrimary } from "./ui";

export function LandingCta() {
  const signedIn = useSession((s) => s.status === "signedIn");
  return (
    <div className="mt-8 flex flex-col items-center gap-3">
      <Link href={signedIn ? "/app" : "/signup"} className={`${buttonPrimary} px-8 py-3 text-lg`}>
        {signedIn ? "Open my plan" : "Sign up — it's free"}
      </Link>
      {!signedIn && (
        <p className="text-sm text-muted">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-accent underline underline-offset-2 hover:no-underline">
            Log in
          </Link>
        </p>
      )}
    </div>
  );
}
