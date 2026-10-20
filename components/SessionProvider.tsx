"use client";
// Mounted once in the layout: follows the Supabase login state and loads/saves the plan.
import { useEffect } from "react";
import { setAccessToken, startPlanSync, stopPlanSync } from "@/lib/planSync";
import { useSession } from "@/lib/session";
import { getSupabase } from "@/lib/supabase";

export function SessionProvider() {
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) {
      useSession.setState({ status: "signedOut", user: null });
      return;
    }
    const apply = (session: { access_token: string; user: { id: string; email?: string | null } } | null | undefined) => {
      setAccessToken(session?.access_token ?? null);
      const user = session?.user;
      if (user) {
        useSession.setState({ status: "signedIn", user: { id: user.id, email: user.email ?? null } });
        startPlanSync(user.id);
      } else {
        useSession.setState({ status: "signedOut", user: null });
        stopPlanSync();
      }
    };
    sb.auth.getSession().then(({ data }) => apply(data.session));
    const { data } = sb.auth.onAuthStateChange((_event, session) => {
      // Run outside Supabase's callback, as its docs recommend.
      setTimeout(() => apply(session), 0);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return null;
}
