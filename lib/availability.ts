// Converting the "hours per day" form (strings, in hours) to Availability (numbers, in minutes).
import type { Availability } from "./types";

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** 150 → "2.5" */
export const toHours = (minutes: number) => String(Math.round((minutes / 60) * 2) / 2);

/** "2,5" → 150. Empty, negative or invalid → 0; capped at 16 hours. */
export const toMinutes = (hours: string) => {
  const n = Number(hours.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(Math.min(n, 16) * 60) : 0;
};

export interface AvailabilityForm {
  hours: string[]; // Mon..Sun
  maxHours: string;
}

export function formFromAvailability(a: Availability): AvailabilityForm {
  return { hours: a.minutesPerWeekday.map(toHours), maxHours: toHours(a.maxMinutesPerDay) };
}

export function availabilityFromForm(
  form: AvailabilityForm,
  daysOff: string[],
): { ok: true; availability: Availability } | { ok: false; error: string } {
  const minutesPerWeekday = form.hours.map(toMinutes) as Availability["minutesPerWeekday"];
  if (minutesPerWeekday.every((m) => m === 0)) return { ok: false, error: "Add some study time on at least one day." };
  return {
    ok: true,
    availability: { minutesPerWeekday, maxMinutesPerDay: toMinutes(form.maxHours) || 300, daysOff },
  };
}
