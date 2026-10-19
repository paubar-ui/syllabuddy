import Link from "next/link";
import { Tick } from "./Tick";
import { buttonSecondary } from "./ui";

/** Placeholder for pages that arrive in a later phase, so navigation never hits a dead end. */
export function ComingSoon({ title, text }: { title: string; text: string }) {
  return (
    <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 pb-28 text-center md:pb-10">
      <Tick size={96} className="mx-auto" />
      <h1 className="mt-4 text-2xl font-bold">{title}</h1>
      <p className="mx-auto mt-2 max-w-md text-muted">{text}</p>
      <Link href="/today" className={`${buttonSecondary} mt-6`}>
        Back to today
      </Link>
    </main>
  );
}
