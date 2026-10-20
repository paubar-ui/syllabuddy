"use client";
// /buddies: weekly leaderboard with friends (points, streak, hours only), using your account.
import { useCallback, useEffect, useState } from "react";
import { MascotBubble } from "@/components/Tick";
import { buttonLink, buttonPrimary, buttonSecondary, card, input, label } from "@/components/ui";
import {
  addFriend,
  deleteMyData,
  loadLeaderboard,
  loadMyProfile,
  removeFriend,
  saveProfile,
  syncWeek,
  type MyProfile,
} from "@/lib/buddies";
import { todayISO } from "@/lib/dates";
import {
  demoBuddies,
  leaderboardComment,
  rankLeaderboard,
  weeklyStats,
  type LeaderboardEntry,
} from "@/lib/leaderboard";
import { useSession } from "@/lib/session";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/lib/useHydrated";

export function BuddiesView() {
  const hydrated = useHydrated();
  if (!hydrated) {
    return (
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 pb-28 md:pb-10" aria-busy="true">
        <h1 className="text-2xl font-bold">Study buddies</h1>
        <p className="mt-2 text-muted">Loading…</p>
      </main>
    );
  }
  return <BuddiesContent />;
}

function BuddiesContent() {
  const user = useSession((s) => s.user);
  return (
    <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 pb-28 md:pb-10">
      <h1 className="text-2xl font-bold sm:text-3xl">Study buddies</h1>
      <p className="mt-1 text-muted">
        Compete with friends on points, streaks and hours. They never see your deadlines, courses or grades.
      </p>
      {user ? (
        <SignedIn userId={user.id} email={user.email} />
      ) : (
        <p className="mt-6 text-muted">Loading…</p>
      )}
    </main>
  );
}

/** What a leaderboard looks like, shown until you pick a display name. */
function DemoPreview() {
  const gamification = useStore((s) => s.gamification);
  const [today] = useState(todayISO);
  const mine = weeklyStats(gamification, today);
  const ranked = rankLeaderboard([{ id: "me", name: "You", ...mine, isMe: true }, ...demoBuddies(mine)]);
  return (
    <section aria-labelledby="demo-board" className="mt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="demo-board" className="text-lg font-semibold">
          Example leaderboard
        </h2>
        <span className="rounded-full bg-warn-bg px-3 py-1 text-xs font-semibold text-warn-ink">
          Preview — these friends are made up
        </span>
      </div>
      <Leaderboard ranked={ranked} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Logged in
// ---------------------------------------------------------------------------

function SignedIn({ userId, email }: { userId: string; email: string | null }) {
  const gamification = useStore((s) => s.gamification);
  const [today] = useState(todayISO);
  const [profile, setProfile] = useState<MyProfile | null | "loading">("loading");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const p = await loadMyProfile(userId);
      setProfile(p);
      if (!p) return;
      const stats = weeklyStats(useStore.getState().gamification, today);
      await syncWeek(userId, stats);
      setEntries(await loadLeaderboard(userId, stats.week));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load your study buddies.");
      setProfile((p) => (p === "loading" ? null : p));
    }
  }, [userId, today]);

  useEffect(() => {
    const t = window.setTimeout(refresh, 0);
    return () => window.clearTimeout(t);
  }, [refresh]);

  if (profile === "loading") return <p className="mt-6 text-muted">Loading your study buddies…</p>;
  if (profile === null)
    return (
      <>
        <ChooseName onSaved={refresh} email={email ?? undefined} />
        <DemoPreview />
      </>
    );

  const ranked = rankLeaderboard(entries.length ? entries : [{ id: userId, name: profile.displayName, ...weeklyStats(gamification, today), isMe: true }]);

  return (
    <>
      {error && (
        <p role="alert" className="mt-4 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="mt-6">
        <MascotBubble message={leaderboardComment(ranked)} />
      </div>

      <section aria-labelledby="board-title" className="mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="board-title" className="text-lg font-semibold">
            This week
          </h2>
          <button type="button" onClick={refresh} className={`${buttonLink} text-sm`}>
            Refresh
          </button>
        </div>
        <Leaderboard ranked={ranked} onRemove={async (id) => {
          const problem = await removeFriend(id);
          if (problem) setError(problem);
          else refresh();
        }} />
      </section>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <InviteCard code={profile.inviteCode} />
        <AddFriendCard onAdded={refresh} />
      </div>

      <AccountCard profile={profile} onRenamed={refresh} />
    </>
  );
}

function ChooseName({ onSaved, email }: { onSaved: () => void; email?: string }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <section aria-labelledby="name-title" className={`${card} mt-6`}>
      <h2 id="name-title" className="text-lg font-semibold">
        Welcome{email ? `, ${email}` : ""}! Pick a display name
      </h2>
      <p className="mt-1 text-sm text-muted">
        Your friends will see this name next to your weekly points, streak and hours — nothing else. A first name or
        nickname is perfect.
      </p>
      <form
        className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={async (e) => {
          e.preventDefault();
          const result = await saveProfile(name.trim());
          if (result.error) setError(result.error);
          else onSaved();
        }}
      >
        <div className="flex-1">
          <label htmlFor="display-name" className={label}>
            Display name
          </label>
          <input
            id="display-name"
            required
            maxLength={40}
            autoComplete="nickname"
            className={input}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          {error && (
            <p role="alert" className="mt-1 text-sm text-danger">
              {error}
            </p>
          )}
        </div>
        <button type="submit" className={buttonPrimary}>
          Save
        </button>
      </form>
    </section>
  );
}

function InviteCard({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <section aria-labelledby="invite-title" className={card}>
      <h2 id="invite-title" className="font-semibold">
        Your invite code
      </h2>
      <p className="mt-2 font-mono text-3xl font-bold tracking-widest">{code}</p>
      <p className="mt-1 text-sm text-muted">Share it with a friend so they can add you.</p>
      <button
        type="button"
        className={`${buttonSecondary} mt-3`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? "Copied!" : "Copy code"}
      </button>
    </section>
  );
}

function AddFriendCard({ onAdded }: { onAdded: () => void }) {
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  return (
    <section aria-labelledby="add-title" className={card}>
      <h2 id="add-title" className="font-semibold">
        Add a friend
      </h2>
      <form
        className="mt-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const result = await addFriend(code);
          if (result.error) setMessage({ error: true, text: result.error });
          else {
            setMessage({ error: false, text: `${result.name} is now your study buddy! 🎉` });
            setCode("");
            onAdded();
          }
        }}
      >
        <label htmlFor="friend-code" className={label}>
          Their invite code
        </label>
        <div className="flex gap-2">
          <input
            id="friend-code"
            required
            maxLength={12}
            autoComplete="off"
            className={`${input} font-mono uppercase`}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <button type="submit" className={buttonPrimary}>
            Add
          </button>
        </div>
        <p role="status" className={`mt-2 min-h-5 text-sm ${message?.error ? "text-danger" : "text-success"}`}>
          {message?.text}
        </p>
      </form>
    </section>
  );
}

function AccountCard({ profile, onRenamed }: { profile: MyProfile; onRenamed: () => void }) {
  const [name, setName] = useState(profile.displayName);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  return (
    <section aria-labelledby="account-title" className={`${card} mt-6`}>
      <h2 id="account-title" className="font-semibold">
        Your account
      </h2>
      <form
        className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={async (e) => {
          e.preventDefault();
          const result = await saveProfile(name.trim());
          setStatus(result.error ?? "Name saved.");
          if (!result.error) onRenamed();
        }}
      >
        <div className="flex-1">
          <label htmlFor="rename" className={label}>
            Display name
          </label>
          <input id="rename" required maxLength={40} className={input} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <button type="submit" className={buttonSecondary}>
          Save name
        </button>
      </form>
      <p role="status" className="mt-2 min-h-5 text-sm text-muted">
        {status}
      </p>
      <div className="mt-2 flex flex-wrap gap-3">
        {!confirmDelete ? (
          <button type="button" className={`${buttonLink} text-sm`} onClick={() => setConfirmDelete(true)}>
            Leave Study Buddies…
          </button>
        ) : (
          <div role="alert" className="w-full rounded-xl bg-danger-soft p-3 text-sm">
            <p className="font-medium text-danger">
              This removes your name, invite code, friendships and weekly stats from Study Buddies. Your plan and
              deadlines stay in your account.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-full bg-danger px-5 py-2.5 font-semibold text-surface"
                onClick={async () => {
                  const problem = await deleteMyData();
                  setStatus(problem ?? "You left Study Buddies.");
                  if (!problem) onRenamed();
                }}
              >
                Yes, delete it
              </button>
              <button type="button" className={buttonSecondary} onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The leaderboard table
// ---------------------------------------------------------------------------

function Leaderboard({
  ranked,
  onRemove,
}: {
  ranked: ReturnType<typeof rankLeaderboard>;
  onRemove?: (id: string) => void;
}) {
  return (
    <div className={`${card} mt-3 overflow-x-auto p-0 sm:p-0`}>
      <table data-testid="leaderboard" className="w-full text-left text-sm">
        <caption className="sr-only">Weekly leaderboard: points, streak and study hours</caption>
        <thead className="text-xs text-muted">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              #
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Name
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Points
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Streak
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Hours
            </th>
            {onRemove && (
              <th scope="col" className="px-3 py-2">
                <span className="sr-only">Actions</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {ranked.map((e) => (
            <tr key={e.id} className={`border-t border-line ${e.isMe ? "bg-accent-soft font-semibold" : ""}`}>
              <td className="px-3 py-2.5">{e.rank === 1 ? "🥇" : e.rank === 2 ? "🥈" : e.rank === 3 ? "🥉" : e.rank}</td>
              <th scope="row" className="px-3 py-2.5 font-medium">
                {e.isMe && e.name !== "You" ? `${e.name} (you)` : e.name}
              </th>
              <td className="px-3 py-2.5 text-right tabular-nums">{e.points}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {e.streak} <span aria-hidden="true">🔥</span>
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">{Math.round((e.minutes / 60) * 10) / 10}</td>
              {onRemove && (
                <td className="px-3 py-2.5 text-right">
                  {!e.isMe && (
                    <button
                      type="button"
                      className="text-xs text-muted underline hover:text-ink"
                      aria-label={`Remove ${e.name} from your study buddies`}
                      onClick={() => onRemove(e.id)}
                    >
                      Remove
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

