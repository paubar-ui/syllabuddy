// Server-side login check (Next.js proxy, runs before a page is sent): logged-out visitors who
// open a protected page are redirected to /login straight away. The browser checks again
// (AuthGate), and the data itself is protected by Row Level Security in Supabase.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isProtectedPath } from "@/lib/protectedPaths";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (!isProtectedPath(pathname) || !url || !key) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      // A refreshed session is written back to the browser.
      setAll: (cookies) => {
        cookies.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getClaims() verifies the session token; a missing, expired or forged cookie gives no claims.
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(login);
  }
  return response;
}

export const config = {
  matcher: [
    "/app/:path*",
    "/today/:path*",
    "/plan/:path*",
    "/courses/:path*",
    "/focus/:path*",
    "/panic/:path*",
    "/settings/:path*",
    "/onboarding/:path*",
    "/buddies/:path*",
    "/exam/:path*",
  ],
};
