"use client";
// Who is logged in, and whether their plan has been loaded from Supabase yet.
import { create } from "zustand";

export type SessionStatus = "loading" | "signedOut" | "signedIn";
export type PlanStatus = "idle" | "loading" | "ready" | "error";

interface SessionState {
  status: SessionStatus;
  user: { id: string; email: string | null } | null;
  plan: PlanStatus;
  /** True while a change couldn't be saved yet (it's being retried). */
  saveFailing: boolean;
}

export const useSession = create<SessionState>(() => ({
  status: "loading",
  user: null,
  plan: "idle",
  saveFailing: false,
}));
