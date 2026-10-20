"use client";
// /settings: coach tone, weekly availability and days off, study buddies, export/import of your data, reset.
import { format, parseISO } from "date-fns";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AvailabilityFields } from "@/components/AvailabilityFields";
import { PageHeader } from "@/components/kit";
import { Tick } from "@/components/Tick";
import { buttonPrimary, buttonSecondary, card, input, label, page } from "@/components/ui";
import { availabilityFromForm, formFromAvailability } from "@/lib/availability";
import { createBackup, parseBackup, type BackupData } from "@/lib/backup";
import { todayISO } from "@/lib/dates";
import { getMascotMessage, type MascotTone } from "@/lib/mascot";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/lib/useHydrated";

const TONES: { value: MascotTone; name: string; description: string }[] = [
  { value: "gentle", name: "Gentle", description: "Soft and encouraging." },
  { value: "coach", name: "Coach", description: "Upbeat and focused." },
  { value: "savage", name: "Savage", description: "Cheeky — but never mean." },
];

export function SettingsView() {
  const hydrated = useHydrated();
  if (!hydrated) {
    return (
      <main id="main" className={page} aria-busy="true">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-2 text-muted">Loading…</p>
      </main>
    );
  }
  return <SettingsContent />;
}

function SettingsContent() {
  return (
    <main id="main" className={page}>
      <PageHeader
        title="Settings"
        description="Make Syllabuddy fit your life: when you can study, how the coach talks to you, friends to compete with, and your data."
      />
      <div className="space-y-6">
        <AvailabilitySettings />
        <ToneSettings />
        <BuddiesCard />
        <DataSettings />
      </div>
    </main>
  );
}

function ToneSettings() {
  const tone = useStore((s) => s.gamification.mascotTone);
  const setMascotTone = useStore((s) => s.setMascotTone);

  return (
    <section aria-labelledby="tone-title" className={card}>
      <h2 id="tone-title" className="text-lg font-semibold tracking-tight">
        Coach tone
      </h2>
      <p className="text-sm text-muted">How the one-line coach message on Today talks to you. You can change it any time.</p>
      <fieldset className="mt-3">
        <legend className="sr-only">How should Tick talk to you?</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {TONES.map((t) => (
            <label
              key={t.value}
              className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${
                tone === t.value ? "border-accent bg-accent-soft" : "border-line hover:bg-surface-2"
              }`}
            >
              <input
                type="radio"
                name="tone"
                value={t.value}
                checked={tone === t.value}
                onChange={() => setMascotTone(t.value)}
                className="mt-1 h-4 w-4 accent-[var(--accent)]"
              />
              <span>
                <span className="block font-medium">{t.name}</span>
                <span className="block text-sm text-muted">{t.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-4 flex items-start gap-3 rounded-xl border border-accent-line bg-accent-soft px-4 py-3">
        <Tick size={22} className="mt-0.5 shrink-0" />
        <p className="text-sm" aria-live="polite">
          <span className="font-semibold">Example · </span>
          {getMascotMessage(tone, "morningPlan", { minutes: 90, count: 2 }, "settings-preview")}
        </p>
      </div>
    </section>
  );
}

function AvailabilitySettings() {
  const saved = useStore((s) => s.availability);
  const [form, setForm] = useState(() => formFromAvailability(saved));
  const [daysOff, setDaysOff] = useState(saved.daysOff);
  const [newDayOff, setNewDayOff] = useState("");
  const [status, setStatus] = useState<{ error: boolean; text: string } | null>(null);
  const [today] = useState(todayISO);
  const upcomingDaysOff = daysOff.filter((d) => d >= today);

  function save() {
    const parsed = availabilityFromForm(form, daysOff);
    if (!parsed.ok) {
      setStatus({ error: true, text: parsed.error });
      return;
    }
    const store = useStore.getState();
    store.setAvailability(parsed.availability);
    store.generatePlan(today);
    const warnings = useStore.getState().warnings.length;
    setStatus({
      error: false,
      text: `Saved — your plan was updated.${warnings ? ` ${warnings} item${warnings === 1 ? "" : "s"} didn't fit; see Today.` : ""}`,
    });
  }

  return (
    <section aria-labelledby="availability-title" className={card}>
      <h2 id="availability-title" className="text-lg font-semibold tracking-tight">
        When you can study
      </h2>
      <p className="text-sm text-muted">
        Roughly how many hours you have for studying on each day of a normal week. Your plan never puts more than this on a
        day — so be realistic, and leave room for classes, work and rest.
      </p>
      <div className="mt-3">
        <AvailabilityFields value={form} onChange={setForm} />
      </div>

      <fieldset className="mt-6">
        <legend className="font-semibold">Days off</legend>
        <p className="text-sm text-muted">Nothing will be planned on these days.</p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {upcomingDaysOff.length === 0 && <li className="text-sm text-muted">No days off planned.</li>}
          {upcomingDaysOff.map((d) => (
            <li key={d} className="flex items-center gap-1 rounded-md border border-accent-line bg-accent-soft py-1 pl-3 pr-1 text-sm">
              {format(parseISO(d), "EEE d MMM")}
              <button
                type="button"
                aria-label={`Remove day off ${format(parseISO(d), "EEEE d MMMM")}`}
                onClick={() => setDaysOff((all) => all.filter((x) => x !== d))}
                className="rounded px-2 hover:bg-surface"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor="new-day-off" className={label}>
              Add a day off
            </label>
            <input
              id="new-day-off"
              type="date"
              min={today}
              className={input}
              value={newDayOff}
              onChange={(e) => setNewDayOff(e.target.value)}
            />
          </div>
          <button
            type="button"
            className={buttonSecondary}
            disabled={!newDayOff}
            onClick={() => {
              if (newDayOff && !daysOff.includes(newDayOff)) setDaysOff((all) => [...all, newDayOff].sort());
              setNewDayOff("");
            }}
          >
            Add
          </button>
        </div>
      </fieldset>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} className={buttonPrimary}>
          Save &amp; update plan
        </button>
        <p role="status" className={`text-sm ${status?.error ? "text-danger" : "text-muted"}`}>
          {status?.text}
        </p>
      </div>
    </section>
  );
}

function download(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function DataSettings() {
  const router = useRouter();
  const [pending, setPending] = useState<BackupData | null>(null);
  const [status, setStatus] = useState<{ error: boolean; text: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  function exportData() {
    const s = useStore.getState();
    const data: BackupData = {
      courses: s.courses,
      deliverables: s.deliverables,
      blocks: s.blocks,
      availability: s.availability,
      pace: s.pace,
      gamification: s.gamification,
      isDemo: s.isDemo,
      focusMinutes: s.focusMinutes,
    };
    download(`syllabuddy-backup-${todayISO()}.json`, createBackup(data, new Date()), "application/json");
    setStatus({ error: false, text: "Backup downloaded. Keep it somewhere safe." });
  }

  async function onFile(file: File | undefined) {
    setPending(null);
    if (!file) return;
    const result = parseBackup(await file.text());
    if (!result.ok) {
      setStatus({ error: true, text: result.error });
      return;
    }
    setPending(result.data);
    setStatus(null);
  }

  return (
    <section aria-labelledby="data-title" className={card}>
      <h2 id="data-title" className="text-lg font-semibold tracking-tight">
        Your data
      </h2>
      <p className="mt-1 text-sm text-muted">
        Your plan is saved privately in your account, so it&apos;s the same on every device. Download a backup as a
        JSON file any time.
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" onClick={exportData} className={buttonSecondary}>
          Export my data (JSON)
        </button>
      </div>

      <div className="mt-4">
        <label htmlFor="import-file" className={label}>
          Import a backup
        </label>
        <input
          id="import-file"
          type="file"
          accept=".json,application/json"
          onChange={(e) => onFile(e.target.files?.[0])}
          className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-accent-soft file:px-4 file:py-2 file:font-semibold file:text-ink"
        />
      </div>
      {pending && (
        <div className="mt-3 rounded-xl border border-line p-3 text-sm">
          <p>
            This backup has {pending.courses.length} course{pending.courses.length === 1 ? "" : "s"},{" "}
            {pending.deliverables.length} deliverables and {pending.gamification.points} points. Importing replaces
            everything currently in Syllabuddy.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonPrimary}
              onClick={() => {
                useStore.getState().importData(pending);
                useStore.getState().generatePlan(todayISO());
                setPending(null);
                setStatus({ error: false, text: "Backup imported." });
              }}
            >
              Replace my data with this backup
            </button>
            <button type="button" className={buttonSecondary} onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <p role="status" className={`mt-3 min-h-5 text-sm ${status?.error ? "text-danger" : "text-muted"}`}>
        {status?.text}
      </p>

      <div className="mt-4 border-t border-line pt-4">
        <h3 className="font-semibold">Reset</h3>
        {!confirmReset ? (
          <button type="button" onClick={() => setConfirmReset(true)} className={`${buttonSecondary} mt-2 text-danger`}>
            Reset all data…
          </button>
        ) : (
          <div role="alert" className="mt-2 rounded-xl bg-danger-soft p-3 text-sm">
            <p className="font-medium text-danger">
              This deletes your courses, deadlines, plan, points and streak from your account. It can&apos;t be undone.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-lg bg-danger px-4 py-2.5 text-sm font-semibold text-surface"
                onClick={() => {
                  useStore.getState().reset();
                  router.push("/app");
                }}
              >
                Yes, delete everything
              </button>
              <button type="button" className={buttonSecondary} onClick={() => setConfirmReset(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function BuddiesCard() {
  return (
    <section aria-labelledby="buddies-title" className={card}>
      <h2 id="buddies-title" className="text-lg font-semibold tracking-tight">
        Study buddies
      </h2>
      <p className="text-sm text-muted">
        Compete with friends on a weekly leaderboard. They only see your display name, points, streak and study hours —
        never your deadlines, courses or grades.
      </p>
      <Link href="/buddies" className={`${buttonSecondary} mt-3`}>
        Open study buddies
      </Link>
    </section>
  );
}
