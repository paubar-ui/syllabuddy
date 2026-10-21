"use client";
// Password reset: /forgot-password sends the email; its link opens /reset-password, where
// Supabase signs you in from the link and you choose a new password.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Tick } from "@/components/Tick";
import { buttonPrimary, card, input, label } from "@/components/ui";
import { requestPasswordReset, updatePassword } from "@/lib/auth";
import { useSession } from "@/lib/session";

function Shell({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <main id="main" className="mx-auto w-full max-w-md flex-1 px-4 py-10">
      <Tick size={40} className="mx-auto" />
      <h1 className="mt-3 text-center text-2xl font-bold">{title}</h1>
      <p className="mt-1 text-center text-muted">{intro}</p>
      {children}
    </main>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  return (
    <Shell title="Forgot your password?" intro="We'll email you a link to choose a new one.">
      <form
        className={`${card} mt-6 space-y-4`}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!email.trim()) return;
          setBusy(true);
          const result = await requestPasswordReset(email.trim());
          setBusy(false);
          setMessage(
            result.ok
              ? {
                  error: false,
                  text: "If there's an account for that email, a reset link is on its way. Open it in this browser. Check your spam folder too.",
                }
              : { error: true, text: result.error },
          );
        }}
      >
        <div>
          <label htmlFor="reset-email" className={label}>
            Email
          </label>
          <input
            id="reset-email"
            type="email"
            autoComplete="email"
            required
            className={input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        {message && (
          <p
            role={message.error ? "alert" : "status"}
            className={`text-sm ${message.error ? "text-danger" : "text-success"}`}
          >
            {message.text}
          </p>
        )}
        <button type="submit" disabled={busy} className={`${buttonPrimary} w-full`}>
          {busy ? "Sending…" : "Send reset link"}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-muted">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-accent underline underline-offset-2 hover:no-underline">
          Log in
        </Link>
      </p>
    </Shell>
  );
}

export function ResetPassword() {
  const router = useRouter();
  const status = useSession((s) => s.status);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waited, setWaited] = useState(false);

  // The link signs you in when the page opens; give it a moment before saying it didn't work.
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 4000);
    return () => clearTimeout(t);
  }, []);

  if (status !== "signedIn") {
    return (
      <Shell title="Choose a new password" intro={waited ? "" : "Checking your reset link…"}>
        {waited && (
          <div className={`${card} mt-6 text-sm`} role="alert">
            <p>
              This reset link has expired or was already used. Links only work once, in the browser that asked for them.
            </p>
            <Link
              href="/forgot-password"
              className="mt-3 inline-block font-medium text-accent underline underline-offset-2"
            >
              Send a new link
            </Link>
          </div>
        )}
      </Shell>
    );
  }

  return (
    <Shell title="Choose a new password" intro="At least 6 characters.">
      <form
        className={`${card} mt-6 space-y-4`}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          const result = await updatePassword(password);
          if (result.ok) router.replace("/app");
          else {
            setError(result.error);
            setBusy(false);
          }
        }}
      >
        <div>
          <label htmlFor="new-password" className={label}>
            New password
          </label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            minLength={6}
            required
            className={input}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className={`${buttonPrimary} w-full`}>
          {busy ? "Saving…" : "Save new password"}
        </button>
      </form>
    </Shell>
  );
}
