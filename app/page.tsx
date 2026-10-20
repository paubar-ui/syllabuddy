import { LandingCta } from "@/components/LandingCta";
import { Tick } from "@/components/Tick";

const BENEFITS = [
  {
    title: "Every deadline in one place",
    text: "Type a deadline or upload a syllabus PDF — Syllabuddy finds the dates and grade weights for you.",
  },
  {
    title: "A daily plan, not a panic",
    text: "Tell it how hard each class feels. It spreads the work into small daily study blocks, so there are no hell weeks.",
  },
  {
    title: "Keep going",
    text: "Check off blocks, keep your streak, use the focus timer — with Tick the mascot cheering you on.",
  },
];

export default function Home() {
  return (
    <main id="main" className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-10 sm:py-16">
      <section className="flex flex-col items-center text-center">
        <Tick size={104} />
        <p className="mt-4 text-sm font-semibold uppercase tracking-wider text-accent">
          For university students juggling 5–7 courses
        </p>
        <h1 className="mt-2 text-3xl font-bold leading-tight sm:text-5xl">
          Turn your syllabi into a daily study plan — and never cram again.
        </h1>
        <p className="mt-4 max-w-xl text-lg text-muted">
          Add your deadlines and Syllabuddy tells you exactly what to study each day, so you start on time and finish
          every course without the all-nighters.
        </p>
        <LandingCta />
      </section>

      <section aria-labelledby="benefits" className="mt-14">
        <h2 id="benefits" className="sr-only">
          What you get
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
        <p className="mt-6 text-center text-sm text-muted">
          Free. Your plan is private and saved to your account, so it&apos;s there on your laptop and your phone.
        </p>
      </section>
    </main>
  );
}
