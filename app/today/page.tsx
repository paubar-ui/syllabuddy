import { redirect } from "next/navigation";

// /today moved to /app (grading contract).
export default function TodayPage() {
  redirect("/app");
}
