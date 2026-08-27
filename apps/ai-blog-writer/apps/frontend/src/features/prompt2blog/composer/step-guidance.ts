/**
 * Operator instructions shared by the step display and submission gate.
 *
 * Keeping the words here matters: the open step and disabled run button must
 * never point at different next actions for the same composer state.
 */
export const P2B_NEXT_ACTION = {
  start: 'Enter a working title, location, and how long the article should be, then generate the direction prompt.',
  direction:
    'Copy the direction prompt into your chatbot, then paste its answer here.',
  chooseDirection: 'Choose one of the three directions.',
  commission:
    'Read the locked commission, change anything that is wrong, then confirm it.',
  changedCommission: 'Review the changed commission, then approve it.',
  savedCommission: 'Review this saved commission, then approve it again.',
  editedCommission: 'Review the changed commission, then approve it again.',
  changedIdentity: 'Generate a new direction prompt for the changed title or location.',
  research:
    'Copy the research prompt into your chatbot, then paste and attach its evidence package.',
  mismatchedResearch: 'Clear the attached research, then gather facts for this commission.',
  incompleteResearch:
    'Replace the attached research with answers to this commission’s exact questions.',
  write: 'Choose the tone, then run the pipeline.',
  chooseProfiles: 'Choose a tone and length.',
} as const
