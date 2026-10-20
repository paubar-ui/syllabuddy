// What to do in one study block (V2-6): goal, checklist, materials and a tip. Exam blocks use
// that day of the exam prep plan; other blocks get a sensible checklist for their type.
import { daysBetween, describeDaysAway } from "./dates";
import { buildExamPlan, examDayFor, isExam, minutesByDateFor, type ExamPlanDay } from "./examPlan";
import type { Course, Deliverable, DeliverableType, StudyBlock } from "./types";

export interface BlockDetail {
  heading: string; // e.g. "Day 3 · Probability" or "Essay draft"
  dayInfo?: string; // "Day 3 of 9 · exam in 6 days"
  goal: string;
  tasks: string[];
  materials: string[];
  tip: string;
  examDay?: ExamPlanDay;
}

const GENERIC: Record<DeliverableType, { goal: string; tasks: string[]; materials: string[]; tip: string }> = {
  essay: {
    goal: "Move the essay one clear step forward.",
    tasks: ["Re-read the prompt and your outline", "Write or improve one section", "Note what the next section needs"],
    materials: ["Essay prompt and rubric", "Your outline and sources"],
    tip: "Write first, polish later — a rough paragraph beats a perfect blank page.",
  },
  project: {
    goal: "Finish one concrete piece of the project.",
    tasks: ["Pick one small task from the project", "Do it until it works", "Write down the next step"],
    materials: ["Project brief", "Your project files"],
    tip: "Choose a task you can finish in this block, so you end with something done.",
  },
  presentation: {
    goal: "Get the presentation closer to ready.",
    tasks: ["Work on the slides for one part", "Say that part out loud once", "Note what still feels unclear"],
    materials: ["Assignment brief", "Your slides and notes"],
    tip: "Rehearsing out loud shows the gaps faster than reading slides.",
  },
  homework: {
    goal: "Solve part of the assignment on your own.",
    tasks: ["Read the questions you'll do today", "Solve them step by step", "Mark anything you need to ask about"],
    materials: ["Assignment questions", "Lecture notes for these topics"],
    tip: "Stuck for more than 10 minutes? Mark it, move on, and ask in class.",
  },
  quiz: {
    goal: "Be ready for the quiz questions.",
    tasks: ["Review the topics the quiz covers", "Do a few practice questions", "Write a one-page summary"],
    materials: ["Lecture notes", "Practice questions"],
    tip: "Test yourself instead of re-reading — recalling is what makes it stick.",
  },
  reading: {
    goal: "Understand the reading's main points.",
    tasks: [
      "Skim headings and the conclusion first",
      "Read the key sections",
      "Write 3 bullet points in your own words",
    ],
    materials: ["The reading"],
    tip: "Read with a question in mind: what is the author trying to prove?",
  },
  exam: {
    goal: "Review the exam topics.",
    tasks: ["Review one topic from your notes", "Do practice problems on it", "Write down what you still can't answer"],
    materials: ["Lecture notes", "Problem sets and solutions"],
    tip: "Add the course schedule on the exam prep page for a topic-by-topic plan.",
  },
  midterm: {
    goal: "Review the midterm topics.",
    tasks: ["Review one topic from your notes", "Do practice problems on it", "Write down what you still can't answer"],
    materials: ["Lecture notes", "Problem sets and solutions"],
    tip: "Add the course schedule on the exam prep page for a topic-by-topic plan.",
  },
  final: {
    goal: "Review the final exam topics.",
    tasks: ["Review one topic from your notes", "Do practice problems on it", "Write down what you still can't answer"],
    materials: ["Lecture notes", "Problem sets and solutions"],
    tip: "Add the course schedule on the exam prep page for a topic-by-topic plan.",
  },
  other: {
    goal: "Make steady progress on this deliverable.",
    tasks: ["Decide what 'done' means for this block", "Work on it without distractions", "Write down the next step"],
    materials: ["Whatever this deliverable needs"],
    tip: "Phone in another room — it's the easiest focus win there is.",
  },
};

const KIND_TIP: Record<ExamPlanDay["kind"], string> = {
  setup: "Be honest with the confidence ratings — they decide where your extra time goes.",
  core: "Close the notes and redo problems from memory; only check the solution after a real attempt.",
  mock: "Real conditions: timer on, phone away, only the materials allowed in the exam.",
  repair: "Fix the cause, not just the answer: redo each lost question from scratch.",
  review: "Keep it light. Sleep does more for tomorrow than one more hour of studying.",
  exam: "Read every question first and start with the one you're surest about.",
};

export function blockDetail({
  block,
  deliverable,
  course,
  blocks,
  today,
}: {
  block: StudyBlock;
  deliverable: Deliverable;
  course?: Course;
  blocks: StudyBlock[];
  today: string;
}): BlockDetail {
  if (isExam(deliverable) && course) {
    const plan = buildExamPlan({
      exam: deliverable,
      course,
      today,
      minutesByDate: minutesByDateFor(blocks, deliverable.id),
    });
    const day = examDayFor(plan, block.date);
    if (day && day.kind !== "exam") {
      return {
        heading: `Day ${day.dayNumber} · ${day.title}`,
        dayInfo: `Day ${day.dayNumber} of ${plan.days.length} · exam ${describeDaysAway(daysBetween(today, deliverable.dueDate))}`,
        goal: day.goal,
        tasks: day.tasks,
        materials: day.materials,
        tip: KIND_TIP[day.kind],
        examDay: day,
      };
    }
  }
  const generic = GENERIC[deliverable.type] ?? GENERIC.other;
  return { heading: deliverable.title, ...generic };
}
