// Shared Tailwind class strings so buttons and inputs look the same everywhere.
// Inputs use 16px text so phones don't zoom in when you tap them.
export const input =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-base text-ink placeholder:text-muted";
export const label = "mb-1 block text-sm font-medium";
export const buttonPrimary =
  "inline-flex items-center justify-center rounded-full bg-accent px-5 py-2.5 font-semibold text-on-accent shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
export const buttonSecondary =
  "inline-flex items-center justify-center rounded-full border border-line bg-surface px-5 py-2.5 font-semibold text-ink transition hover:bg-accent-soft disabled:opacity-50";
export const buttonLink = "font-medium text-accent underline underline-offset-2 hover:no-underline";
export const card = "rounded-2xl border border-line bg-surface p-4 shadow-sm sm:p-5";
