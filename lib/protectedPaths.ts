// Pages that need you to be logged in. Checked twice: on the server (proxy.ts, before the page
// is sent) and in the browser (AuthGate, while your plan loads).
export const PROTECTED = [
  "/app",
  "/today",
  "/plan",
  "/courses",
  "/focus",
  "/panic",
  "/settings",
  "/onboarding",
  "/buddies",
  "/exam",
];

export const isProtectedPath = (path: string) => PROTECTED.some((p) => path === p || path.startsWith(`${p}/`));
