import Link from "next/link";
import { DemoButton } from "@/components/DemoButton";
import { Tick } from "@/components/Tick";

const BENEFITS = [
  {
    title: "Every deadline in one place",
    text: "Paste or upload your syllabi. Syllabuddy finds the dates and grade weights for you to check.",
  },
  {
    title: "A daily plan that fits your life",
    text: "Tell us how hard each class feels and when you're free. We spread the work so there are no hell weeks.",
  },
  {
    title: "Stay on track, together",
    text: "Check off study blocks, keep your streak, earn points — with Tick cheering you on, and friends to compete with.",
  },
];

export default function Home() {
  return (
    <main id="main" className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-10 sm:py-16">
      <section className="flex flex-col items-center text-center">
        <Tick size={112} />
        <p className="mt-4 text-sm font-semibold uppercase tracking-wider text-accent">Syllabuddy</p>
        <h1 className="mt-2 text-3xl font-bold leading-tight sm:text-5xl">
          Your syllabi, turned into a daily study plan.
        </h1>
        <p className="mt-4 max-w-xl text-lg text-muted">
          Upload your syllabi, tell us how hard each class is for you, and get a daily study plan that
          keeps you on track — with streaks, a mascot coach and friends to compete with.
        </p>
        <div className="mt-8 flex w-full flex-col items-center justify-center gap-3 sm:flex-row">
          <DemoButton className="w-full sm:w-auto" />
          <Link
            href="/onboarding"
            data-testid="start-button"
            className="w-full rounded-full border-2 border-accent px-6 py-2.5 text-center text-base font-semibold text-accent transition hover:bg-accent-soft sm:w-auto"
          >
            Start with my syllabi
          </Link>
        </div>
        <p className="mt-3 text-sm text-muted">No account needed. Your plan stays in this browser.</p>
      </section>

      <section aria-labelledby="benefits" className="mt-14">
        <h2 id="benefits" className="sr-only">
          Why Syllabuddy
        </h2>
        <ul className="grid gap-4 sm:grid-cols-3">
          {BENEFITS.map((b, i) => (
            <li key={b.title} className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
              <span
                aria-hidden="true"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft font-bold text-accent"
              >
                {i + 1}
              </span>
              <h3 className="mt-3 font-semibold">{b.title}</h3>
              <p className="mt-1 text-sm text-muted">{b.text}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
