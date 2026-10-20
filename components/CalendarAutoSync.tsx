"use client";
// Re-reads the Blackboard calendar link when the app opens — at most every 6 hours (V2-3).
import { useEffect } from "react";
import { needsResync } from "@/lib/blackboard";
import { resync } from "@/lib/calendarSync";
import { useStore } from "@/lib/store";

export function CalendarAutoSync() {
  useEffect(() => {
    if (needsResync(useStore.getState().calendar, new Date())) void resync();
  }, []);
  return null;
}
