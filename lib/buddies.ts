// Study Buddies: the leaderboard with friends. It shares a display name and weekly aggregates
// (points, streak, minutes) — never courses, grades or syllabi. Uses the same account as the app.
import { getSupabase, supabaseConfigured } from "./supabase";
import type { LeaderboardEntry, WeeklyStats } from "./leaderboard";

export { getSupabase };
export const buddiesConfigured = supabaseConfigured;

async function currentUserId(): Promise<string | null> {
  const { data } = (await getSupabase()?.auth.getSession()) ?? { data: { session: null } };
  return data.session?.user.id ?? null;
}

export interface MyProfile {
  displayName: string;
  inviteCode: string;
}

export async function loadMyProfile(userId: string): Promise<MyProfile | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const [{ data: profile }, { data: code }] = await Promise.all([
    sb.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
    sb.from("invite_codes").select("code").eq("user_id", userId).maybeSingle(),
  ]);
  if (!profile || !code) return null;
  return { displayName: profile.display_name, inviteCode: code.code };
}

/** Creates or renames your profile; returns your invite code. */
export async function saveProfile(displayName: string): Promise<{ code?: string; error?: string }> {
  const sb = getSupabase();
  if (!sb) return { error: "Study Buddies isn't set up on this site yet." };
  const { data, error } = await sb.rpc("ensure_my_profile", { p_display_name: displayName });
  return error ? { error: friendly(error.message) } : { code: data as string };
}

export async function addFriend(code: string): Promise<{ name?: string; error?: string }> {
  const sb = getSupabase();
  if (!sb) return { error: "Study Buddies isn't set up on this site yet." };
  const { data, error } = await sb.rpc("add_friend_by_code", { p_code: code });
  return error ? { error: friendly(error.message) } : { name: data as string };
}

export async function removeFriend(friendId: string): Promise<string | null> {
  const { error } = (await getSupabase()?.rpc("remove_friend", { p_friend: friendId })) ?? {};
  return error ? friendly(error.message) : null;
}

export async function deleteMyData(): Promise<string | null> {
  const { error } = (await getSupabase()?.rpc("delete_my_data")) ?? {};
  return error ? friendly(error.message) : null;
}

/** Uploads this week's aggregates. Only points, streak and minutes — never courses or grades. */
export async function syncWeek(userId: string, stats: WeeklyStats): Promise<void> {
  await getSupabase()
    ?.from("weekly_stats")
    .upsert(
      {
        user_id: userId,
        week: stats.week,
        points: stats.points,
        streak: stats.streak,
        minutes: stats.minutes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,week" },
    );
}

/** Syncs quietly if you're signed in and have a profile; does nothing otherwise. */
export async function syncIfSignedIn(stats: WeeklyStats): Promise<void> {
  try {
    const id = await currentUserId();
    if (!id) return;
    // Only people who joined Study Buddies (picked a display name) share their weekly totals.
    const { data } = (await getSupabase()?.from("profiles").select("id").eq("id", id).maybeSingle()) ?? { data: null };
    if (data) await syncWeek(id, stats);
  } catch {
    // Offline or not set up: the next visit will try again.
  }
}

/** You and your friends for this week. RLS only returns rows you're allowed to see. */
export async function loadLeaderboard(userId: string, week: string): Promise<LeaderboardEntry[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const [{ data: profiles, error: e1 }, { data: stats, error: e2 }] = await Promise.all([
    sb.from("profiles").select("id, display_name"),
    sb.from("weekly_stats").select("user_id, points, streak, minutes").eq("week", week),
  ]);
  if (e1 || e2) throw new Error(friendly((e1 ?? e2)!.message));
  const byUser = new Map((stats ?? []).map((s) => [s.user_id as string, s]));
  return (profiles ?? []).map((p) => {
    const s = byUser.get(p.id as string);
    return {
      id: p.id as string,
      name: p.display_name as string,
      points: s?.points ?? 0,
      streak: s?.streak ?? 0,
      minutes: s?.minutes ?? 0,
      isMe: p.id === userId,
    };
  });
}

function friendly(message: string): string {
  if (/no one has that invite code/i.test(message)) return "No one has that invite code — check it with your friend.";
  if (/your own code/i.test(message)) return "That's your own invite code. Share it with a friend instead!";
  if (/up to 50/i.test(message)) return "You can have up to 50 study buddies.";
  if (/rate limit|security purposes/i.test(message)) return "Please wait a minute before asking for another link.";
  if (/fetch|network/i.test(message)) return "Couldn't reach the server — check your internet connection.";
  return "Something went wrong. Please try again.";
}
