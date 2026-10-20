import { Landing } from "@/components/Landing";
import { RedirectIfSignedIn } from "@/components/RedirectIfSignedIn";

export default function Home() {
  return (
    <>
      {/* Returning, logged-in users go straight to their daily briefing. */}
      <RedirectIfSignedIn to="/app" />
      <Landing />
    </>
  );
}
