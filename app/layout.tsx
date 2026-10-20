import type { Metadata, Viewport } from "next";
import { DM_Sans, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { AppShell } from "@/components/AppNav";
import { AuthGate } from "@/components/AuthGate";
import { SessionProvider } from "@/components/SessionProvider";
import "./globals.css";

// DM Sans: soft and geometric — warm and approachable without looking childish.
const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin", "latin-ext"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Syllabuddy — your syllabi, turned into a daily study plan",
    template: "%s · Syllabuddy",
  },
  description:
    "Upload your syllabi, tell us how hard each class is for you, and get a daily study plan that keeps you on track — with streaks, a mascot coach and friends to compete with.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0e" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${dmSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-on-accent"
        >
          Skip to content
        </a>
        <SessionProvider />
        {/* The nav and gate read the URL, which on dynamic pages (/focus/…) is only known at request time. */}
        <Suspense fallback={null}>
          <AppShell>
            <AuthGate>{children}</AuthGate>
          </AppShell>
        </Suspense>
      </body>
    </html>
  );
}
