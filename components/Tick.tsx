// Tick, Syllabuddy's logo mark: a simple line-drawn clock in the accent colour.
// Its messages are shown as a short, quiet "Coach" line rather than a cartoon speech bubble.
export function Tick({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={`text-accent ${className}`}
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
    >
      <circle cx="16" cy="17" r="11" />
      <path d="M16 11v6l4 2.5" />
      <path d="M7 6.5 9.5 4.5M25 6.5 22.5 4.5" />
    </svg>
  );
}

/** The coach's one-line message. Announced politely to screen readers when it changes. */
export function MascotBubble({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-accent-line bg-accent-soft px-4 py-3">
      <Tick size={22} className="mt-0.5 shrink-0" />
      <p data-testid="mascot-message" aria-live="polite" className="text-sm leading-relaxed">
        <span className="font-semibold">Coach · </span>
        {message}
      </p>
    </div>
  );
}
