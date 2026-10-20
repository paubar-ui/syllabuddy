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
  sessions?: CourseSession[]; // session-by-session schedule from the syllabus (V2-6)
}

/** One class session from the syllabus schedule. */
export interface CourseSession {
  number: number; // session / week / lecture number
  date?: string; // ISO date, when known
  topic: string;
  concepts: string[]; // sub-topics / key concepts
  readings: string[];
  problemSets: string[]; // e.g. "PS3", "Problem set 4"
}

export type MistakeReason = "concept" | "algebra" | "time";

/** A point lost in the mock exam, logged per topic (session number). */
export interface MockMistake {
  session: number;
  points: number;
  reason: MistakeReason;
}

/** Extra details for exams (midterm, final, exam). Everything is optional and editable. */
export interface ExamDetails {
  format?: string; // e.g. "problems", "multiple choice", "essay questions"
  durationMinutes?: number;
  materials?: string; // e.g. "closed book, calculator allowed"
  time?: string; // e.g. "09:00"
  coversSessions?: number[];
  focus?: Record<number, "core" | "light">;
  confidence?: Record<number, 1 | 2 | 3 | 4 | 5>;
  mockLog?: MockMistake[];
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
  exam?: ExamDetails; // only for exam / midterm / final (V2-6)
  sessionRef?: number; // "due in Session 15" — its date comes from the Blackboard calendar (V2-3)
  dateFromCalendar?: boolean; // true while the date is the one Blackboard gave (re-syncs update it)
}

export interface StudyBlock {
  id: string;
  deliverableId: string;
  date: string; // ISO date
  minutes: number;
  status: "planned" | "done" | "missed";
  pinned?: boolean; // moved by hand to this day: replanning keeps it here
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

/** One class meeting from the Blackboard calendar, numbered per course in date order (V2-3). */
export interface ClassSession {
  number: number;
  date: string; // ISO date
  start: string; // "10:00"
  end: string; // "11:30"
}

/** A course as it appears in the Blackboard calendar. */
export interface CalendarCourse {
  key: string; // stable grouping key
  name: string;
  sessions: ClassSession[];
}

/** The connected Blackboard calendar. The link is private: only you can read it (your own row). */
export interface CalendarSync {
  url?: string; // the share link (secret) — never logged, never exported
  fileName?: string; // when an .ics file was uploaded instead
  lastSync?: string; // ISO date-time of the last successful read
  error?: string; // friendly message when the last re-sync failed
  courses: CalendarCourse[];
  /** Blackboard course key → Syllabuddy course id ("" = not matched). */
  mapping: Record<string, string>;
}
