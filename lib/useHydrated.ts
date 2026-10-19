"use client";
// False on the server and during the first browser render, true afterwards.
// Pages that read saved data (localStorage) wait for this, so server and browser HTML match.
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
