// Calendar export (CLAUDE.md §5.8): one event per planned study block (back to back from 18:00)
// and one all-day event per deadline. Follows RFC 5545: CRLF line endings, UID + DTSTAMP on
// every event, escaped text and lines folded at 75 bytes. Times are "floating" local times,
// so 18:00 stays 18:00 in whatever time zone your calendar uses.
import { addDaysISO } from "./dates";
import type { Course, Deliverable, StudyBlock } from "./types";

export interface IcsInput {
  courses: Course[];
  deliverables: Deliverable[];
  blocks: StudyBlock[];
  now: Date;
  startHour?: number;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 2026-11-05 → 20261105 */
const icsDate = (iso: string) => iso.replaceAll("-", "");

/** Minutes after midnight on an ISO day → 20261105T180000 (local, floating). */
function icsLocalDateTime(iso: string, minutesFromMidnight: number): string {
  const extraDays = Math.floor(minutesFromMidnight / 1440);
  const m = minutesFromMidnight % 1440;
  return `${icsDate(addDaysISO(iso, extraDays))}T${pad(Math.floor(m / 60))}${pad(m % 60)}00`;
}

function icsUtc(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

export function escapeText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Splits a line into ≤ 75-byte pieces; continuation lines start with a space. */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    const limit = parts.length === 0 ? 75 : 74; // continuation lines lose a byte to the space
    if (bytes + size > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function buildIcs({ courses, deliverables, blocks, now, startHour = 18 }: IcsInput): string {
  const stamp = icsUtc(now);
  const courseName = new Map(courses.map((c) => [c.id, c.name]));
  const deliverableById = new Map(deliverables.map((d) => [d.id, d]));
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Syllabuddy//Study plan//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Syllabuddy",
  ];

  const planned = blocks
    .filter((b) => b.status === "planned")
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  let currentDate = "";
  let cursor = 0;
  for (const block of planned) {
    if (block.date !== currentDate) {
      currentDate = block.date;
      cursor = startHour * 60;
    }
    const d = deliverableById.get(block.deliverableId);
    const course = d ? courseName.get(d.courseId) : undefined;
    const title = d ? `Study: ${d.title}${course ? ` (${course})` : ""}` : "Study block";
    lines.push(
      "BEGIN:VEVENT",
      `UID:block-${block.id}@syllabuddy`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsLocalDateTime(block.date, cursor)}`,
      `DTEND:${icsLocalDateTime(block.date, cursor + block.minutes)}`,
      `SUMMARY:${escapeText(title)}`,
      `DESCRIPTION:${escapeText(`${block.minutes}-minute study block planned by Syllabuddy.`)}`,
      "END:VEVENT",
    );
    cursor += block.minutes;
  }

  for (const d of deliverables) {
    if (d.done) continue;
    const course = courseName.get(d.courseId);
    lines.push(
      "BEGIN:VEVENT",
      `UID:deadline-${d.id}@syllabuddy`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(d.dueDate)}`,
      `DTEND;VALUE=DATE:${icsDate(addDaysISO(d.dueDate, 1))}`,
      `SUMMARY:${escapeText(`Due: ${d.title}${course ? ` (${course})` : ""}`)}`,
      `DESCRIPTION:${escapeText(`${d.weight}% of the final grade.`)}`,
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
