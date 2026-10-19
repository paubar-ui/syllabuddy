// Small date helpers. All dates in the app are ISO day strings: "2026-10-19".
import { addDays, differenceInCalendarDays, format, getISODay, parseISO } from "date-fns";

export function toISODate(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function addDaysISO(iso: string, days: number): string {
  return toISODate(addDays(parseISO(iso), days));
}

/** Whole calendar days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return differenceInCalendarDays(parseISO(to), parseISO(from));
}

/** 0 = Monday … 6 = Sunday (matches Availability.minutesPerWeekday). */
export function weekdayIndex(iso: string): number {
  return getISODay(parseISO(iso)) - 1;
}

/** "today", "tomorrow" or "in 3 days". */
export function describeDaysAway(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}
