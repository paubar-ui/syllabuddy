"use client";
// Plan → Blackboard calendar (V2-3): connect with the calendar's share link (or upload an
// .ics file), match Blackboard courses to your courses, re-sync, disconnect.
import { format, parseISO } from "date-fns";
import { useState } from "react";
import { Callout, HowItWorks } from "@/components/kit";
import { buttonLink, buttonPrimary, buttonSecondary, card, input, label } from "@/components/ui";
import { resync, syncFromFile, syncFromUrl, type SyncResult } from "@/lib/calendarSync";
import { useStore } from "@/lib/store";

const describe = (r: Extract<SyncResult, { ok: true }>) =>
  `Found ${r.sessions} classes in ${r.courses} course${r.courses === 1 ? "" : "s"}. Check the matches below.`;

export function CalendarCard() {
  const calendar = useStore((s) => s.calendar);
  const courses = useStore((s) => s.courses);
  const setCalendarMapping = useStore((s) => s.setCalendarMapping);
  const disconnectCalendar = useStore((s) => s.disconnectCalendar);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [replacing, setReplacing] = useState(false);

  async function run(task: () => Promise<SyncResult>) {
    setBusy(true);
    setStatus(null);
    const result = await task();
    setBusy(false);
    setStatus(result.ok ? { ok: true, text: describe(result) } : { ok: false, text: result.message });
    if (result.ok) {
      setLink("");
      setReplacing(false);
    }
  }

  const connected = Boolean(calendar);
  const showForm = !connected || replacing;

  return (
    <section aria-labelledby="calendar-title" data-testid="calendar-card" className={card}>
      <h2 id="calendar-title" className="text-lg font-semibold tracking-tight">
        Blackboard calendar
      </h2>
      <p className="text-sm text-muted">
        Connect your Blackboard calendar so Syllabuddy knows your class times. No study blocks are planned during class,
        and a syllabus deadline like “Session 15” gets the real date of that class. No Blackboard password needed.
      </p>

      {connected && calendar && (
        <div className="mt-4">
          <p className="text-sm">
            <span className="font-medium">
              {calendar.url ? "Connected with your share link" : `Read from ${calendar.fileName ?? "an .ics file"}`}
            </span>
            {calendar.lastSync && (
              <span className="text-muted"> · last read {format(new Date(calendar.lastSync), "d MMM, HH:mm")}</span>
            )}
          </p>
          {calendar.error && (
            <Callout tone="warn" className="mt-3" title="Couldn't refresh your calendar">
              {calendar.error}
            </Callout>
          )}

          <h3 className="mt-4 text-sm font-semibold">Which course is which?</h3>
          <p className="text-xs text-muted">
            We matched them by name — fix any that are wrong. Class times always count as busy, matched or not.
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[30rem] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-muted">
                  <th scope="col" className="py-2 pr-3 font-medium">
                    In Blackboard
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Classes
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    Your course in Syllabuddy
                  </th>
                </tr>
              </thead>
              <tbody>
                {calendar.courses.map((cc) => {
                  const id = `map-${cc.key.replace(/[^a-z0-9]+/g, "-")}`;
                  const first = cc.sessions[0];
                  return (
                    <tr key={cc.key} className="border-b border-line align-top">
                      <th scope="row" className="py-2 pr-3 font-medium">
                        {cc.name}
                      </th>
                      <td className="py-2 pr-3 text-muted">
                        {cc.sessions.length}
                        {first && (
                          <span className="block text-xs">
                            from {format(parseISO(first.date), "d MMM")} · {first.start}–{first.end}
                          </span>
                        )}
                      </td>
                      <td className="py-2">
                        <label htmlFor={id} className="sr-only">
                          Syllabuddy course for {cc.name}
                        </label>
                        <select
                          id={id}
                          className={input}
                          value={calendar.mapping[cc.key] ?? ""}
                          onChange={(e) => setCalendarMapping(cc.key, e.target.value)}
                        >
                          <option value="">Not one of my courses</option>
                          {courses.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {calendar.url && (
              <button type="button" disabled={busy} onClick={() => run(resync)} className={buttonPrimary}>
                {busy ? "Reading…" : "Re-sync now"}
              </button>
            )}
            <button
              type="button"
              onClick={() => setReplacing((r) => !r)}
              aria-expanded={replacing}
              className={buttonSecondary}
            >
              Use another link or file
            </button>
            <button
              type="button"
              onClick={() => {
                disconnectCalendar();
                setStatus({ ok: true, text: "Disconnected. Your link was removed from your account." });
              }}
              className={buttonLink}
            >
              Disconnect
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <div className="mt-4 space-y-4">
          <ol className="list-decimal space-y-0.5 pl-5 text-sm">
            <li>In Blackboard, open Calendar.</li>
            <li>Open the calendar settings (the gear icon) and choose “Share calendar”.</li>
            <li>Copy the link it shows and paste it below.</li>
          </ol>
          <form
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              if (link.trim()) void run(() => syncFromUrl(link));
            }}
          >
            <div className="flex-1">
              <label htmlFor="calendar-link" className={label}>
                Calendar share link
              </label>
              <input
                id="calendar-link"
                data-testid="calendar-link-input"
                type="url"
                inputMode="url"
                autoComplete="off"
                placeholder="https://… or webcal://…"
                className={input}
                value={link}
                onChange={(e) => setLink(e.target.value)}
              />
            </div>
            <button type="submit" disabled={busy || !link.trim()} className={buttonPrimary}>
              {busy ? "Reading…" : "Connect"}
            </button>
          </form>
          <div>
            <label htmlFor="calendar-file" className={label}>
              Or upload an .ics file
            </label>
            <input
              id="calendar-file"
              data-testid="calendar-file-input"
              type="file"
              accept=".ics,text/calendar"
              className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface-2 file:px-3 file:py-2 file:text-sm file:font-medium"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void run(() => syncFromFile(file));
              }}
            />
            <p className="mt-1 text-xs text-muted">
              A file is read once; a link can be re-synced when your timetable changes.
            </p>
          </div>
        </div>
      )}

      <p role="status" className={`mt-3 text-sm ${status?.ok ? "text-success" : "text-danger"}`}>
        {status?.text}
      </p>

      <div className="mt-2">
        <HowItWorks title="How the calendar is used">
          <p>
            Classes are numbered per course in date order, so the 15th class is “Session 15”. Deadlines in the syllabus
            given as a session number get that class&apos;s date — you can still change it.
          </p>
          <p>
            Study blocks start at 18:00. If a class runs into the evening, study starts 15 minutes after it ends, and
            the class time doesn&apos;t count as free time.
          </p>
          <p>
            Your link is like a password to your calendar: it&apos;s stored only in your account, never shared and never
            included in exports. A link is re-read automatically when you open the app, at most every 6 hours.
          </p>
        </HowItWorks>
      </div>
    </section>
  );
}
