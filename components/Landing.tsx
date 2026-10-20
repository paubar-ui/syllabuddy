import { LandingCta } from "./LandingCta";
import { Tick } from "./Tick";

const STEPS = [
  {
    title: "Add your deadlines",
    text: "Type them in, or paste or upload a syllabus PDF and we find every date and grade weight for you.",
    tone: "border-accent-line bg-accent-soft text-accent",
  },
  {
    title: "Get a daily plan",
    text: "Tell us how hard each class feels and when you're free. We spread the work into small daily study blocks — no hell weeks.",
    tone: "border-info-line bg-info-soft text-info-ink",
  },
  {
    title: "Tick it off, stay on track",
    text: "Check off blocks, use the focus timer, keep your streak. Missed a day? Your plan adjusts by itself.",
    tone: "border-success-line bg-success-soft text-success",
  },
];

/** The marketing page: shown at / to visitors, and at /about to everyone. */
export function Landing() {
  return (
    <main id="main" className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-12 sm:px-6 sm:py-20">
      <section className="flex flex-col items-center text-center">
        <Tick size={48} />
        <p className="mt-5 rounded-full border border-accent-line bg-accent-soft px-3 py-1 text-sm font-medium text-accent">
          For university students juggling 5–7 courses
        </p>
        <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          Turn your syllabi into a daily study plan — and never cram again.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted">
          Add your deadlines and Syllabuddy tells you exactly what to study each day, so you start on time and finish every
          course without the all-nighters.
        </p>
        <LandingCta />
      </section>

      <section aria-labelledby="how" className="mt-16">
        <h2 id="how" className="text-center text-sm font-semibold uppercase tracking-wider text-muted">
          How it works
        </h2>
        <ol className="mt-5 grid gap-4 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="rounded-xl border border-line bg-surface p-5">
              <span
                aria-hidden="true"
                className={`flex h-8 w-8 items-center justify-center rounded-lg border text-sm font-semibold ${step.tone}`}
              >
                {i + 1}
              </span>
              <h3 className="mt-3 font-semibold">{step.title}</h3>
              <p className="mt-1 text-sm text-muted">{step.text}</p>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-center text-sm text-muted">
          Free. Your plan is private and saved to your account, so it&apos;s there on your laptop and your phone.
        </p>
      </section>
    </main>
  );
}
