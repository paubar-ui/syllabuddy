// Tick, Syllabuddy's original mascot: a small round alarm clock with a friendly face.
export function Tick({ size = 72, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {/* bells */}
      <circle cx="24" cy="20" r="11" fill="#f59e0b" />
      <circle cx="76" cy="20" r="11" fill="#f59e0b" />
      {/* feet */}
      <rect x="22" y="84" width="12" height="10" rx="5" fill="#4338ca" transform="rotate(20 28 89)" />
      <rect x="66" y="84" width="12" height="10" rx="5" fill="#4338ca" transform="rotate(-20 72 89)" />
      {/* body + face */}
      <circle cx="50" cy="54" r="38" fill="#4338ca" />
      <circle cx="50" cy="54" r="31" fill="#fffdf5" />
      {/* hour marks */}
      <g fill="#c7d2fe">
        <circle cx="50" cy="27" r="2.2" />
        <circle cx="77" cy="54" r="2.2" />
        <circle cx="50" cy="81" r="2.2" />
        <circle cx="23" cy="54" r="2.2" />
      </g>
      {/* eyes */}
      <circle cx="40" cy="48" r="4" fill="#1e1b4b" />
      <circle cx="60" cy="48" r="4" fill="#1e1b4b" />
      <circle cx="41.3" cy="46.6" r="1.3" fill="#fff" />
      <circle cx="61.3" cy="46.6" r="1.3" fill="#fff" />
      {/* cheeks */}
      <circle cx="33" cy="58" r="4" fill="#fda4af" opacity="0.7" />
      <circle cx="67" cy="58" r="4" fill="#fda4af" opacity="0.7" />
      {/* smile */}
      <path d="M42 61 Q50 69 58 61" stroke="#1e1b4b" strokeWidth="3" fill="none" strokeLinecap="round" />
      {/* hands */}
      <line x1="50" y1="54" x2="50" y2="34" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" />
      <line x1="50" y1="54" x2="62" y2="42" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="50" cy="54" r="2.5" fill="#f59e0b" />
    </svg>
  );
}

/** Tick with a speech bubble. The bubble text is announced politely to screen readers. */
export function MascotBubble({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3">
      <Tick size={64} className="shrink-0" />
      <p
        data-testid="mascot-message"
        aria-live="polite"
        className="relative rounded-2xl rounded-tl-sm border border-line bg-surface px-4 py-3 text-base leading-relaxed shadow-sm"
      >
        <span className="sr-only">Tick says: </span>
        {message}
      </p>
    </div>
  );
}
