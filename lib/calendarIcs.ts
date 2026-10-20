// Reads an .ics calendar (e.g. a Blackboard calendar share link) into simple events (V2-3).
// Handles folded lines, escaped text, all-day events, times with a time zone (TZID — read as
// local wall-clock time), UTC times (converted to this device's time) and weekly repeats (RRULE).
const pad = (n: number) => String(n).padStart(2, "0");
const MAX_OCCURRENCES = 300;

export interface CalendarEvent {
  uid: string;
  summary: string;
  /** "2026-11-17T10:00" local time, or "2026-11-17" for all-day events. */
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
  description?: string;
  categories?: string[];
}

interface RawProp {
  name: string;
  params: Record<string, string>;
  value: string;
}

/** Undo line folding (CRLF + space/tab continues the previous line). */
function unfold(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\n[ \t]/g, "")
    .split("\n");
}

function parseLine(line: string): RawProp | null {
  // NAME;PARAM=a;PARAM2="b:c":value — the first colon outside quotes ends the parameters.
  let inQuotes = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') inQuotes = !inQuotes;
    else if (line[i] === ":" && !inQuotes) {
      colon = i;
      break;
    }
  }
  if (colon < 0) return null;
  const [name, ...rawParams] = line.slice(0, colon).split(";");
  const params: Record<string, string> = {};
  for (const p of rawParams) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: name.toUpperCase(), params, value: line.slice(colon + 1) };
}

export function unescapeText(value: string): string {
  return value.replace(/\\([\\;,nN])/g, (_, c: string) => (c === "n" || c === "N" ? "\n" : c));
}

/** Date/time value → local "YYYY-MM-DDTHH:mm" (or "YYYY-MM-DD" when all-day). */
export function parseIcsDate(prop: Pick<RawProp, "value" | "params">): { value: string; allDay: boolean } | null {
  const v = prop.value.trim();
  const date = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (date || prop.params.VALUE === "DATE") {
    const m = date ?? /^(\d{4})(\d{2})(\d{2})/.exec(v);
    return m ? { value: `${m[1]}-${m[2]}-${m[3]}`, allDay: true } : null;
  }
  const dt = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(v);
  if (!dt) return null;
  const [, y, mo, d, h, mi, , z] = dt;
  if (z) {
    const local = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi));
    return {
      value: `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}T${pad(local.getHours())}:${pad(local.getMinutes())}`,
      allDay: false,
    };
  }
  // Floating or TZID time: keep the wall-clock time (classes are in the student's own time zone).
  return { value: `${y}-${mo}-${d}T${h}:${mi}`, allDay: false };
}

// ---------- local date-time arithmetic on "YYYY-MM-DDTHH:mm" strings ----------
const toDate = (s: string) => new Date(`${s.length === 10 ? `${s}T00:00` : s}:00`);
const fromDate = (d: Date, allDay: boolean) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
  (allDay ? "" : `T${pad(d.getHours())}:${pad(d.getMinutes())}`);
function addDays(s: string, days: number, allDay: boolean): string {
  const d = toDate(s);
  d.setDate(d.getDate() + days);
  return fromDate(d, allDay);
}
const minutesBetween = (a: string, b: string) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / 60000);
function addMinutes(s: string, minutes: number): string {
  const d = toDate(s);
  d.setMinutes(d.getMinutes() + minutes);
  return fromDate(d, false);
}

const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/** Expands a weekly or daily RRULE (the kinds course calendars use). Other rules: first event only. */
function expand(event: CalendarEvent, rrule: string | undefined, exdates: Set<string>): CalendarEvent[] {
  if (!rrule) return [event];
  const rule = Object.fromEntries(
    rrule.split(";").map((p) => {
      const [k, v = ""] = p.split("=");
      return [k.toUpperCase(), v];
    }),
  );
  if (rule.FREQ !== "WEEKLY" && rule.FREQ !== "DAILY") return [event];
  const interval = Math.max(1, Number(rule.INTERVAL) || 1);
  const count = rule.COUNT ? Number(rule.COUNT) : MAX_OCCURRENCES;
  const until = rule.UNTIL ? parseIcsDate({ value: rule.UNTIL, params: {} })?.value : undefined;
  const duration = event.allDay ? 0 : minutesBetween(event.start, event.end);
  const startDay = toDate(event.start);
  const byDay =
    rule.FREQ === "WEEKLY" && rule.BYDAY
      ? rule.BYDAY.split(",")
          .map((d: string) => WEEKDAYS.indexOf(d.slice(-2)))
          .filter((i: number) => i >= 0)
      : [startDay.getDay()];

  const out: CalendarEvent[] = [];
  const step = rule.FREQ === "DAILY" ? interval : 1;
  let generated = 0; // COUNT includes occurrences later removed by EXDATE
  for (let i = 0; generated < Math.min(count, MAX_OCCURRENCES) && i < 366 * 3; i += step) {
    const start = addDays(event.start, i, event.allDay);
    const day = toDate(start);
    if (until && start.slice(0, until.length) > until) break;
    if (rule.FREQ === "WEEKLY") {
      const week = Math.floor(i / 7);
      if (week % interval !== 0 || !byDay.includes(day.getDay())) continue;
    }
    generated++;
    if (exdates.has(start) || exdates.has(start.slice(0, 10))) continue;
    out.push({
      ...event,
      uid: `${event.uid}#${start}`,
      start,
      end: event.allDay ? addDays(start, 1, true) : addMinutes(start, duration),
    });
  }
  return out;
}

export function parseIcs(text: string): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const overrides = new Map<string, CalendarEvent>(); // RECURRENCE-ID: one changed occurrence
  let current: RawProp[] | null = null;
  let depth = 0;

  for (const line of unfold(text)) {
    if (line === "BEGIN:VEVENT") {
      current = [];
      depth = 0;
      continue;
    }
    if (!current) continue;
    if (line.startsWith("BEGIN:"))
      depth++; // e.g. a VALARM inside the event
    else if (line.startsWith("END:") && line !== "END:VEVENT") depth--;
    else if (line === "END:VEVENT") {
      const props = current;
      current = null;
      const get = (name: string) => props.find((p) => p.name === name);
      const start = get("DTSTART") && parseIcsDate(get("DTSTART")!);
      if (!start) continue;
      const endProp = get("DTEND") && parseIcsDate(get("DTEND")!);
      const durationMin = /^PT(?:(\d+)H)?(?:(\d+)M)?$/.exec(get("DURATION")?.value ?? "");
      const end =
        endProp?.value ??
        (start.allDay
          ? addDays(start.value, 1, true)
          : addMinutes(start.value, durationMin ? Number(durationMin[1] ?? 0) * 60 + Number(durationMin[2] ?? 0) : 60));
      const event: CalendarEvent = {
        uid: get("UID")?.value ?? `${start.value}-${events.length}`,
        summary: unescapeText(get("SUMMARY")?.value ?? "").trim(),
        start: start.value,
        end,
        allDay: start.allDay,
        location: get("LOCATION") ? unescapeText(get("LOCATION")!.value).trim() : undefined,
        description: get("DESCRIPTION") ? unescapeText(get("DESCRIPTION")!.value).trim() : undefined,
        categories: get("CATEGORIES")
          ? get("CATEGORIES")!
              .value.split(/(?<!\\),/)
              .map((c) => unescapeText(c).trim())
              .filter(Boolean)
          : undefined,
      };
      const recurrenceId = get("RECURRENCE-ID") && parseIcsDate(get("RECURRENCE-ID")!);
      if (recurrenceId) {
        overrides.set(`${event.uid}#${recurrenceId.value}`, event);
        continue;
      }
      const exdates = new Set(
        props
          .filter((p) => p.name === "EXDATE")
          .flatMap((p) => p.value.split(",").map((v) => parseIcsDate({ value: v, params: p.params })?.value ?? "")),
      );
      events.push(...expand(event, get("RRULE")?.value, exdates));
    } else if (depth === 0) {
      const prop = parseLine(line);
      if (prop) current.push(prop);
    }
  }

  return events
    .map((e) => {
      const override = overrides.get(e.uid) ?? overrides.get(`${e.uid.split("#")[0]}#${e.start}`);
      return override ? { ...override, uid: e.uid } : e;
    })
    .sort((a, b) => a.start.localeCompare(b.start));
}
