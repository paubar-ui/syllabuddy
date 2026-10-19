// Tick, the little clock coach: message bank with 3 tones × 6 situations (CLAUDE.md §5.7).
// Savage is cheeky about procrastination, never insulting and never guilt-tripping about rest.
import type { Gamification, StudyBlock } from "./types";

export type MascotTone = Gamification["mascotTone"];
export type MascotSituation =
  | "morningPlan"
  | "allDone"
  | "missedYesterday"
  | "deadlineSoon"
  | "streakMilestone"
  | "burnout";

/** Placeholders: {minutes} {count} {title} {when} {streak} */
export const MESSAGES: Record<MascotTone, Record<MascotSituation, string[]>> = {
  gentle: {
    morningPlan: [
      "Good morning! Today's plan is {minutes} minutes across {count} blocks — one at a time is plenty.",
      "Hi there. {count} small blocks today, {minutes} minutes in total. Go gently, you've got this.",
      "A calm {minutes} minutes today. Start with whichever block feels easiest.",
    ],
    allDone: [
      "Everything's done for today. Be proud, and rest well.",
      "All blocks checked off. That's a lovely day's work — enjoy your evening.",
    ],
    missedYesterday: [
      "Yesterday didn't go to plan, and that's okay. I've moved things around so today is a fresh start.",
      "No stress about yesterday. Small steps today count just as much.",
    ],
    deadlineSoon: [
      "{title} is due {when}. A little focused time today will make it feel lighter.",
      "Heads up: {title} is due {when}. You're closer than you think.",
    ],
    streakMilestone: [
      "{streak} days in a row! That's real consistency — I'm proud of you.",
      "A {streak}-day streak. Quietly impressive.",
    ],
    burnout: [
      "You've been working really hard. How about a calm evening off tonight? Your plan will adjust.",
      "Rest is part of studying too. Let's protect tonight for you.",
    ],
  },
  coach: {
    morningPlan: [
      "Today's mission: {count} blocks, {minutes} minutes. Start the first one and build momentum.",
      "Plan's ready: {minutes} minutes of focused work. Knock out block one early.",
      "{count} blocks on the board. Pick one, set the timer, go.",
    ],
    allDone: [
      "All blocks done. That's how you win a semester — one day at a time.",
      "Clean sweep today! Same again tomorrow.",
    ],
    missedYesterday: [
      "Yesterday slipped — happens to everyone. Plan's updated, so let's get back on track today.",
      "New day, new plan. Hit today's first block and you're back in the game.",
    ],
    deadlineSoon: [
      "{title} is due {when}. Prioritise it today and you'll walk in ready.",
      "{title} is due {when}. Time to lock in.",
    ],
    streakMilestone: [
      "{streak}-day streak! Discipline is turning into habit.",
      "{streak} days strong. Keep the chain going.",
    ],
    burnout: [
      "Even athletes have rest days. Take tonight off — recovery is part of the plan.",
      "You've pushed hard for days. Smart move now: protect tonight and come back sharper.",
    ],
  },
  savage: {
    morningPlan: [
      "{minutes} minutes today. Your phone will survive without you, I promise.",
      "{count} blocks on the menu. Sadly, they won't check themselves off.",
      "{minutes} minutes. That's like two episodes. You can do two episodes of studying.",
    ],
    allDone: [
      "Done already? Who are you and what did you do with the procrastinator?",
      "All blocks checked. Okay, show-off. Go enjoy your evening.",
    ],
    missedYesterday: [
      "Yesterday's blocks went on a little vacation. I've rescheduled them — no more holidays.",
      "We don't talk about yesterday. Today, though? Today we show up.",
    ],
    deadlineSoon: [
      "{title} is due {when}. It's not going to write itself — trust me, I checked.",
      "Psst: {title} is due {when}. Future you is already nervous. Help them out.",
    ],
    streakMilestone: [
      "{streak} days in a row? Okay, overachiever. Respect.",
      "{streak}-day streak. Your old procrastination habits are filing a complaint.",
    ],
    burnout: [
      "Even I stop ticking sometimes. Take tonight off — that's a friendly order.",
      "You've been grinding nonstop. Tonight's homework: absolutely nothing.",
    ],
  },
};

export type MascotVars = Partial<Record<"minutes" | "count" | "title" | "when" | "streak", string | number>>;

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

/** Same seed (e.g. today's date) → same message, so it doesn't change on every re-render. */
export function getMascotMessage(
  tone: MascotTone,
  situation: MascotSituation,
  vars: MascotVars = {},
  seed = "",
): string {
  const options = MESSAGES[tone][situation];
  const template = options[hash(seed + situation) % options.length];
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    String(vars[key as keyof MascotVars] ?? ""),
  );
}

export interface MascotContext {
  todayBlocks: StudyBlock[];
  missedYesterday: boolean;
  /** Days until the nearest open deadline, if one is within 72h. */
  nextDeadlineDays?: number | null;
  streak: number;
  burnout?: boolean;
}

/** Picks what Tick should talk about, most important first. */
export function pickSituation(ctx: MascotContext): MascotSituation {
  if (ctx.burnout) return "burnout";
  const allDone =
    ctx.todayBlocks.length > 0 && ctx.todayBlocks.every((b) => b.status === "done");
  if (allDone) {
    return ctx.streak > 0 && ctx.streak % 7 === 0 ? "streakMilestone" : "allDone";
  }
  if (ctx.missedYesterday) return "missedYesterday";
  if (ctx.nextDeadlineDays != null && ctx.nextDeadlineDays <= 3) return "deadlineSoon";
  return "morningPlan";
}
