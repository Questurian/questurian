const ROUND_TRIP_STEPS = [
  'Copy prompt',
  'Paste into your chatbot',
  'Paste the answer here',
] as const

/** The same copy-out / paste-in handoff taught in direction and research. */
export function ChatbotRoundTrip() {
  return (
    <ol className="p2b-round-trip" aria-label="Chatbot round trip">
      {ROUND_TRIP_STEPS.map((label, index) => (
        <li key={label}>
          <span className="p2b-round-trip-number" aria-hidden="true">
            {index + 1}
          </span>
          <strong>{label}</strong>
        </li>
      ))}
    </ol>
  )
}
