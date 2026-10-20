// A realistic demo semester so graders (and the bot) never see an empty screen.
// Due dates are relative to "today", spread over the next 10 weeks.
import { addDaysISO } from "./dates";
import { estimateHours } from "./estimate";
import type { Availability, Course, CourseSession, Deliverable, DeliverableType, ExamDetails } from "./types";

export const DEMO_AVAILABILITY: Availability = {
  minutesPerWeekday: [210, 210, 210, 210, 150, 120, 180], // Mon..Sun ≈ 21.5h a week
  maxMinutesPerDay: 300,
  daysOff: [],
};

type DemoItem = [title: string, type: DeliverableType, weight: number, daysFromToday: number];

/** [number, days from today, topic, concepts, reading, problem set] */
type DemoSession = [number, number, string, string[], string, string?];

// Statistics has a full session schedule and a midterm 10 days from today,
// so the sample semester shows an exam prep plan straight away (V2-6).
const STATS_SESSIONS: DemoSession[] = [
  [1, -24, "Descriptive statistics", ["mean and median", "variance", "standard deviation"], "Ch. 1–2", "PS1"],
  [2, -20, "Probability", ["sample spaces", "conditional probability", "Bayes' rule"], "Ch. 3", "PS2"],
  [3, -17, "Random variables", ["expected value", "variance of a random variable", "binomial distribution"], "Ch. 4", "PS3"],
  [4, -13, "The normal distribution", ["z-scores", "standardising", "normal approximation"], "Ch. 5", "PS4"],
  [5, -6, "Sampling distributions", ["central limit theorem", "standard error"], "Ch. 6", "PS5"],
  [6, 3, "Confidence intervals", ["intervals for a mean", "t-distribution", "margin of error"], "Ch. 7"],
  [7, 13, "Hypothesis testing", ["p-values", "type I and II errors"], "Ch. 8", "PS6"],
  [8, 20, "Comparing two groups", ["two-sample t-test", "paired samples"], "Ch. 9"],
  [9, 27, "Correlation and regression", ["least squares", "R²"], "Ch. 10", "PS7"],
  [10, 34, "Multiple regression", ["interpreting coefficients", "dummy variables"], "Ch. 11"],
];

const STATS_MIDTERM: ExamDetails = {
  format: "problems + short-answer questions",
  durationMinutes: 90,
  materials: "closed book, one formula sheet, calculator allowed",
  coversSessions: [1, 2, 3, 4, 5, 6],
};

const DEMO_COURSES: (Omit<Course, "id"> & { key: string; items: DemoItem[] })[] = [
  {
    key: "fin",
    name: "Corporate Finance",
    color: "#1d4ed8",
    effort: 4,
    gradeScale: 10,
    targetGrade: 8,
    attendancePolicy: "Attendance is mandatory; missing more than 30% of sessions means failing the course.",
    items: [
      ["Problem set 1: Time value of money", "homework", 10, 3],
      ["Midterm exam", "midterm", 30, 24],
      ["Valuation case study", "project", 20, 45],
      ["Final exam", "final", 40, 68],
    ],
  },
  {
    key: "mkt",
    name: "Marketing Management",
    color: "#be185d",
    effort: 2,
    gradeScale: 10,
    targetGrade: 8.5,
    attendancePolicy: "Participation counts towards the final grade.",
    items: [
      ["Reading reflection: Positioning", "homework", 10, 1],
      ["Brand audit presentation", "presentation", 25, 18],
      ["Consumer insights essay", "essay", 25, 38],
      ["Final marketing plan", "project", 40, 63],
    ],
  },
  {
    key: "stats",
    name: "Statistics",
    color: "#047857",
    effort: 5,
    gradeScale: 100,
    targetGrade: 75,
    items: [
      ["Quiz 1: Probability", "quiz", 10, 2],
      ["Midterm exam", "midterm", 25, 10],
      ["Problem set: Regression", "homework", 10, 30],
      ["Quiz 2: Inference", "quiz", 10, 47],
      ["Final exam", "final", 45, 70],
    ],
  },
  {
    key: "law",
    name: "Business Law",
    color: "#b45309",
    effort: 3,
    gradeScale: 10,
    targetGrade: 7,
    attendancePolicy: "Students must attend at least 80% of sessions.",
    items: [
      ["Case brief: Contract formation", "essay", 15, 9],
      ["Moot court presentation", "presentation", 20, 33],
      ["Research essay", "essay", 25, 52],
      ["Final exam", "final", 40, 66],
    ],
  },
];

export function createDemoSemester(today: string): { courses: Course[]; deliverables: Deliverable[] } {
  const courses: Course[] = [];
  const deliverables: Deliverable[] = [];

  for (const { key, items, ...course } of DEMO_COURSES) {
    const courseId = `demo-${key}`;
    const sessions: CourseSession[] | undefined =
      key === "stats"
        ? STATS_SESSIONS.map(([number, days, topic, concepts, reading, ps]) => ({
            number,
            date: addDaysISO(today, days),
            topic,
            concepts,
            readings: [reading],
            problemSets: ps ? [ps] : [],
          }))
        : undefined;
    courses.push({ id: courseId, ...course, ...(sessions ? { sessions } : {}) });
    items.forEach(([title, type, weight, days], i) => {
      deliverables.push({
        ...(key === "stats" && type === "midterm" ? { exam: STATS_MIDTERM } : {}),
        id: `${courseId}-${i + 1}`,
        courseId,
        title,
        type,
        dueDate: addDaysISO(today, days),
        weight,
        estimatedHours: estimateHours({ type, weight, effort: course.effort }),
        loggedMinutes: 0,
        done: false,
      });
    });
  }
  return { courses, deliverables };
}
