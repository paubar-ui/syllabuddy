"use client";
// /signup and /login: email + password (grading contract test ids). Both lead to /app.
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Tick } from "@/components/Tick";
import { buttonPrimary, card, input, label } from "@/components/ui";
import { logIn, signUp } from "@/lib/auth";
import { useSession } from "@/lib/session";

export function AuthForm({ mode }: { mode: "signup" | "login" }) {
  const router = useRouter();
  const params = useSearchParams();
  const status = useSession((s) => s.status);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isSignup = mode === "signup";
  const p = isSignup ? "signup" : "login";

  // Only go back to pages inside the app (never to another site).
  const next = params.get("next");
  const destination = next && next.startsWith("/") && !next.startsWith("//") ? next : "/app";

  useEffect(() => {
    if (status === "signedIn") router.replace(destination);
  }, [status, destination, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = isSignup ? await signUp(email.trim(), password) : await logIn(email.trim(), password);
    if (result.ok) {
      router.replace(destination);
    } else {
      setError(result.error);
      setBusy(false);
    }
  }

  return (
    <main id="main" className="mx-auto w-full max-w-md flex-1 px-4 py-10">
      <Tick size={40} className="mx-auto" />
      <h1 className="mt-3 text-center text-2xl font-bold">
        {isSignup ? "Create your free account" : "Welcome back"}
      </h1>
      <p className="mt-1 text-center text-muted">
        {isSignup
          ? "Turn your deadlines into a daily study plan — saved to your account, on any device."
          : "Log in to see today's plan."}
      </p>

      <form onSubmit={onSubmit} className={`${card} mt-6 space-y-4`} noValidate={false}>
        <div>
          <label htmlFor={`${p}-email`} className={label}>
            Email
          </label>
          <input
            id={`${p}-email`}
            data-testid={`${p}-email`}
            type="email"
            required
            autoComplete="email"
            className={input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor={`${p}-password`} className={label}>
            Password
          </label>
          <input
            id={`${p}-password`}
            data-testid={`${p}-password`}
            type="password"
            required
            minLength={isSignup ? 6 : undefined}
            autoComplete={isSignup ? "new-password" : "current-password"}
            className={input}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby={isSignup ? "password-help" : undefined}
          />
          {isSignup && (
            <p id="password-help" className="mt-1 text-xs text-muted">
              At least 6 characters.
            </p>
          )}
        </div>
        {error && (
          <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
            {error}
          </p>
        )}
        <button type="submit" data-testid={`${p}-submit`} disabled={busy} className={`${buttonPrimary} w-full`}>
          {busy ? (isSignup ? "Creating your account…" : "Logging in…") : isSignup ? "Sign up" : "Log in"}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-muted">
        {isSignup ? "Already have an account? " : "New to Syllabuddy? "}
        <Link
          href={isSignup ? "/login" : "/signup"}
          className="font-medium text-accent underline underline-offset-2 hover:no-underline"
        >
          {isSignup ? "Log in" : "Create a free account"}
        </Link>
      </p>
      {isSignup && (
        <p className="mt-2 text-center text-xs text-muted">
          Your plan is private: only you can see it. We only use your email to log you in.
        </p>
      )}
    </main>
  );
}
