// Shared data model for Syllabuddy (see CLAUDE.md §4).

export type Effort = 1 | 2 | 3 | 4 | 5; // 1 = easy for me, 5 = very hard for me

export type DeliverableType =
  | "exam"
  | "midterm"
  | "final"
  | "essay"
  | "project"
  | "presentation"
  | "quiz"
  | "homework"
  | "reading"
  | "other";

export interface Course {
  id: string;
  name: string;
  color: string;
  effort: Effort;
  targetGrade?: number; // on the course's scale, e.g. 8.5 / 10
  gradeScale: number; // e.g. 10 or 100
  attendancePolicy?: string; // raw text from syllabus, optional
}

export interface Deliverable {
  id: string;
  courseId: string;
  title: string;
  type: DeliverableType;
  dueDate: string; // ISO date
  weight: number; // % of final grade, 0–100
  score?: number; // grade obtained, once known
  estimatedHours: number; // computed, user can override
  loggedMinutes: number; // from focus timer + manual logs
  done: boolean;
}

export interface StudyBlock {
  id: string;
  deliverableId: string;
  date: string; // ISO date
  minutes: number;
  status: "planned" | "done" | "missed";
}

export interface Availability {
  minutesPerWeekday: [number, number, number, number, number, number, number]; // Mon..Sun
  maxMinutesPerDay: number; // hard cap (burnout guard), default 300
  daysOff: string[]; // ISO dates
}

export interface PaceProfile {
  // learned ratios actual/estimated
  byType: Partial<Record<DeliverableType, number>>;
  byCourse: Record<string, number>;
}

export interface Gamification {
  points: number;
  streak: number;
  bestStreak: number;
  streakFreezes: number;
  lastCompletedDate?: string;
  lastCheckedDate?: string; // last past day already checked for a missed streak
  mascotTone: "gentle" | "coach" | "savage";
  history: { date: string; minutes: number; points: number }[];
}
