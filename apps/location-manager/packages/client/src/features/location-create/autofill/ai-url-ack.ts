/**
 * Acknowledgment gate for AI-suggested URL fields (ADR-0008 §2, ADR-0009 §5).
 *
 * Policy: a URL filled by AI must be explicitly verified by the operator
 * before Create; replacing the value by hand makes the field the operator's
 * again and lifts the requirement. Every category with add-time AI URL
 * suggestions (dining, accommodations, and attractions/nightlife per
 * ADR-0009 §5) shares these transitions.
 *
 * Transitions preserve object identity when nothing changes, so they can be
 * passed to React state setters without causing redundant re-renders.
 */
export type AiUrlAckState<TField extends string> = Record<TField, boolean>;

/** All fields start acknowledged: nothing AI-suggested yet, nothing to verify. */
export function initAiUrlAck<TField extends string>(
  fields: readonly TField[]
): AiUrlAckState<TField> {
  return Object.fromEntries(fields.map((field) => [field, true])) as AiUrlAckState<TField>;
}

/** An AI suggestion landed in the field: verification is now required. */
export function markAiUrlSuggested<TField extends string, TState extends AiUrlAckState<TField>>(
  state: TState,
  field: TField
): TState {
  return state[field] === false ? state : { ...state, [field]: false };
}

/** Operator toggled the "I verified this URL" checkbox. */
export function setAiUrlAcknowledged<TField extends string, TState extends AiUrlAckState<TField>>(
  state: TState,
  field: TField,
  acknowledged: boolean
): TState {
  return state[field] === acknowledged ? state : { ...state, [field]: acknowledged };
}

/** Operator replaced the AI value by hand: the field is theirs again. */
export function liftAiUrlAckOnUserEdit<TField extends string, TState extends AiUrlAckState<TField>>(
  state: TState,
  field: TField
): TState {
  return state[field] === true ? state : { ...state, [field]: true };
}

/** Create stays blocked until every AI-suggested URL is acknowledged. */
export function allAiUrlsAcknowledged<TField extends string>(
  state: AiUrlAckState<TField>
): boolean {
  return Object.values(state).every(Boolean);
}
