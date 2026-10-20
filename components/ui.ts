// Shared Tailwind class strings so buttons and inputs look the same everywhere.
// Inputs use 16px text so phones don't zoom in when you tap them.
export const input =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-base text-ink placeholder:text-muted";
export const label = "mb-1 block text-sm font-medium";
export const buttonPrimary =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
export const buttonSecondary =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-surface-2 disabled:opacity-50";
export const buttonLink = "font-medium text-accent underline underline-offset-2 hover:no-underline";
export const card = "rounded-xl border border-line bg-surface p-4 sm:p-5";
/** Page body: room for the phone's bottom bar. */
export const page = "mx-auto w-full max-w-4xl flex-1 px-4 py-6 pb-28 sm:px-6 md:py-8 md:pb-10";
/** Wider page body for the week view. */
export const pageWide = "mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-28 sm:px-6 md:py-8 md:pb-10";
