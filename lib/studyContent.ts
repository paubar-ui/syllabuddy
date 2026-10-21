// "What do you need to study?" (exam prep): turns content you paste — a list of topics, your
// notes' headings or a session list — into numbered topics the exam plan can organise.
import { parseSessions } from "./parseSessions";
import type { CourseSession } from "./types";

const MAX_TOPICS = 40;

/** One topic per line; "Topic: concept, concept" keeps the concepts. Session lists work too. */
export function topicsFromText(text: string, today: string): CourseSession[] {
  const sessions = parseSessions(text, { today }).sessions;
  if (sessions.length >= 2) return sessions.slice(0, MAX_TOPICS).map(({ number, topic, concepts, readings, problemSets }) => ({ number, topic, concepts, readings, problemSets }));

  const topics: CourseSession[] = [];
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw
      .replace(/^\s*(?:[-*•·▪◦]|\d{1,2}[.)]|[a-z][.)])\s*/i, "")
      .replace(/\s+/g, " ")
      .trim();
    if (line.length < 2) continue;
    const [head, rest] = splitOnce(line);
    topics.push({
      number: topics.length + 1,
      topic: head.slice(0, 120),
      concepts: rest
        ? rest
            .split(/[,;]/)
            .map((c) => c.trim())
            .filter(Boolean)
            .slice(0, 12)
        : [],
      readings: [],
      problemSets: [],
    });
    if (topics.length >= MAX_TOPICS) break;
  }
  return topics;
}

/** "Probability: Bayes, independence" → ["Probability", "Bayes, independence"]. */
function splitOnce(line: string): [string, string | undefined] {
  const m = /^(.{2,80}?)\s*(?::|\s[—–-]\s)\s*(.+)$/.exec(line);
  return m ? [m[1].trim(), m[2].trim()] : [line, undefined];
}
