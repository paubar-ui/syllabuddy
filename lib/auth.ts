"use client";
// Email + password accounts with Supabase Auth (grading contract).
import { flushPlan, stopPlanSync } from "./planSync";
import { getSupabase } from "./supabase";

export type AuthResult = { ok: true } | { ok: false; error: string };

function friendlyAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) return "Wrong email or password. Please try again.";
  if (/already registered|already exists/i.test(message))
    return "There's already an account with this email. Try logging in.";
  if (/password should be at least|weak password/i.test(message))
    return "Please use a password with at least 6 characters.";
  if (/invalid.*email|email address.*invalid/i.test(message)) return "That email address doesn't look right.";
  if (/email not confirmed/i.test(message)) return "Please confirm your email first (check your inbox).";
  if (/rate limit/i.test(message)) return "Too many attempts. Please wait a minute and try again.";
  if (/fetch|network/i.test(message)) return "Couldn't reach the server — check your internet connection.";
  return "Something went wrong. Please try again.";
}

export async function signUp(email: string, password: string): Promise<AuthResult> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: "Accounts aren't set up on this site yet." };
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) return { ok: false, error: friendlyAuthError(error.message) };
  // With "Confirm email" off, Supabase signs you in straight away.
  if (!data.session) {
    return { ok: false, error: "Your account was created — please check your email to confirm it, then log in." };
  }
  return { ok: true };
}

export async function logIn(email: string, password: string): Promise<AuthResult> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: "Accounts aren't set up on this site yet." };
  const { error } = await sb.auth.signInWithPassword({ email, password });
  return error ? { ok: false, error: friendlyAuthError(error.message) } : { ok: true };
}

/**
 * Sends a password-reset email. The answer is the same whether or not the email has an account,
 * so the form can't be used to find out who uses Syllabuddy.
 */
export async function requestPasswordReset(email: string): Promise<AuthResult> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: "Accounts aren't set up on this site yet." };
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error && /rate limit|fetch|network/i.test(error.message))
    return { ok: false, error: friendlyAuthError(error.message) };
  return { ok: true };
}

/** Sets a new password for the account the reset link signed you into. */
export async function updatePassword(password: string): Promise<AuthResult> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: "Accounts aren't set up on this site yet." };
  const { error } = await sb.auth.updateUser({ password });
  return error ? { ok: false, error: friendlyAuthError(error.message) } : { ok: true };
}

export async function logOut(): Promise<void> {
  await flushPlan(); // never lose the last change
  await getSupabase()?.auth.signOut();
  stopPlanSync();
}
