import { redirect } from "next/navigation";

// Courses are added on My courses now (one folder per course); old links land there.
export default function OnboardingPage() {
  redirect("/courses");
}
