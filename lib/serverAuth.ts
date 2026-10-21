// Who is calling an API route: the logged-in user from the session cookie, or from an
// "Authorization: Bearer <token>" header. Server-only. Returns null when nobody is logged in,
// and routes answer 401 then.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseKey, supabaseUrl } from "./supabase";

export async function userIdFrom(request: Request): Promise<string | null> {
  if (!supabaseUrl || !supabaseKey) return null;
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    try {
      const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: { apikey: supabaseKey, Authorization: auth },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;
      return ((await res.json()) as { id?: string }).id ?? null;
    } catch {
      return null;
    }
  }
  const jar = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: { getAll: () => jar.getAll(), setAll: () => {} },
  });
  const { data } = await supabase.auth.getClaims();
  return (data?.claims?.sub as string | undefined) ?? null;
}

export const unauthorized = () =>
  Response.json({ error: "login_required", message: "Please log in." }, { status: 401 });
