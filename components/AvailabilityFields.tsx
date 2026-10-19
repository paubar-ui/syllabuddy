"use client";
// "Hours per day" + daily cap inputs, shared by onboarding and settings.
import { WEEKDAYS, type AvailabilityForm } from "@/lib/availability";
import { input, label } from "./ui";

export function AvailabilityFields({
  value,
  onChange,
}: {
  value: AvailabilityForm;
  onChange: (next: AvailabilityForm) => void;
}) {
  return (
    <>
      <fieldset>
        <legend className="font-semibold">Hours per day</legend>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {WEEKDAYS.map((day, i) => (
            <div key={day}>
              <label htmlFor={`hours-${i}`} className={label}>
                {day}
              </label>
              <input
                id={`hours-${i}`}
                type="number"
                min={0}
                max={16}
                step={0.5}
                inputMode="decimal"
                className={input}
                value={value.hours[i]}
                onChange={(e) =>
                  onChange({ ...value, hours: value.hours.map((v, j) => (j === i ? e.target.value : v)) })
                }
              />
            </div>
          ))}
        </div>
      </fieldset>
      <div className="mt-5 max-w-xs">
        <label htmlFor="max-hours" className={label}>
          Never plan more than (hours a day)
        </label>
        <input
          id="max-hours"
          type="number"
          min={0.5}
          max={16}
          step={0.5}
          inputMode="decimal"
          className={input}
          value={value.maxHours}
          onChange={(e) => onChange({ ...value, maxHours: e.target.value })}
        />
        <p className="mt-1 text-sm text-muted">A hard limit that protects you from burnout.</p>
      </div>
    </>
  );
}
