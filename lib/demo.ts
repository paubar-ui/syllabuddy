// A realistic demo semester so graders (and the bot) never see an empty screen.
// Due dates are relative to "today", spread over the next 10 weeks.
import { addDaysISO } from "./dates";
import { estimateHours } from "./estimate";
import type { Availability, Course, Deliverable, DeliverableType } from "./types";

export const DEMO_AVAILABILITY: Availability = {
  minutesPerWeekday: [150, 150, 150, 150, 90, 60, 120], // Mon..Sun
  maxMinutesPerDay: 300,
  daysOff: [],
};

type DemoItem = [title: string, type: DeliverableType, weight: number, daysFromToday: number];

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
      ["Problem set 1: Time value of money", "homework", 10, 2],
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
      ["Quiz 1: Probability", "quiz", 10, 4],
      ["Problem set: Regression", "homework", 10, 15],
      ["Midterm exam", "midterm", 25, 30],
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
    courses.push({ id: courseId, ...course });
    items.forEach(([title, type, weight, days], i) => {
      deliverables.push({
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
