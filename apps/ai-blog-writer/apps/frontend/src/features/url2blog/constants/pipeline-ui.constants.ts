export type NarrativeFocusPreset = {
  id: string
  label: string
  prompt: string
}

export type Url2BlogProgressStep = {
  key: string
  stage: string | null
  label: string
}

export const NARRATIVE_FOCUS_PRESETS: NarrativeFocusPreset[] = [
  ['practical_trip_planner', 'Practical Trip Planner', 'Prioritize decision-ready guidance for planning: where to go, what to book, and how to avoid common mistakes.'],
  ['beginner_friendly_explainer', 'Beginner-Friendly Explainer', 'Write for first-timers. Define jargon, explain why each point matters, and keep instructions clear and confidence-building.'],
  ['expert_depth', 'Expert Depth', 'Assume informed readers. Emphasize nuance, tradeoffs, and advanced context instead of generic introductory advice.'],
  ['executive_summary', 'Executive Summary', 'Front-load key takeaways and high-impact recommendations for readers with limited time.'],
  ['budget_maximizer', 'Budget Maximizer', 'Focus on affordability, value-for-money options, and practical cost-saving decisions without sacrificing quality.'],
  ['luxury_premium', 'Luxury Premium', 'Target premium travelers seeking high-end comfort, service quality, and elevated experiences.'],
  ['family_friendly', 'Family-Friendly', 'Optimize recommendations for families with children, including safety, convenience, and age-appropriate choices.'],
  ['solo_traveler', 'Solo Traveler', 'Write for solo readers who need confidence, situational awareness, and independent planning guidance.'],
  ['safety_first', 'Safety-First', 'Prioritize safety and risk-reduction details, including practical precautions and common pitfalls to avoid.'],
  ['sustainable_responsible', 'Sustainable & Responsible', 'Emphasize environmentally responsible and culturally respectful choices with practical alternatives.'],
  ['local_culture', 'Local Culture Lens', 'Highlight local context, cultural etiquette, and authentic experiences rather than surface-level tourist framing.'],
  ['myth_busting', 'Myth-Busting Angle', 'Challenge common misconceptions and replace them with evidence-based guidance and balanced reasoning.'],
  ['step_by_step', 'Step-by-Step Playbook', 'Structure advice into clear, actionable steps that readers can follow in sequence.'],
  ['comparison_framework', 'Comparison Framework', 'Present options with pros, cons, and decision criteria so readers can choose based on their priorities.'],
  ['human_story', 'Human Story', 'Lean into narrative clarity and human moments while preserving factual usefulness and trust.'],
  ['data_evidence', 'Data & Evidence', 'Ground claims with verifiable facts, concrete examples, and explicit reasoning to reduce fluff.'],
  ['problem_solution', 'Problem-Solution', 'Frame content around reader pain points and practical solutions with direct implementation advice.'],
  ['checklist_ready', 'Checklist-Ready', 'Organize material into concise, scannable checklist logic without losing depth where needed.'],
  ['journalistic_neutral', 'Journalistic Neutral', 'Keep tone balanced and credible, separating claims from interpretation while maintaining readability.'],
  ['conversion_oriented', 'Conversion-Oriented', 'Prioritize clarity that helps readers confidently take next actions such as booking, comparing, or planning.'],
].map(([id, label, prompt]) => ({ id, label, prompt }))

export const URL2BLOG_PROGRESS_STEPS: Url2BlogProgressStep[] = [
  { key: 'submitted', stage: null, label: 'URL submitted' },
  { key: 'stage_1', stage: 'stage_1', label: 'Stage 1: Extract article' },
  { key: 'stage_2', stage: 'stage_2', label: 'Stage 2: Classify article type' },
  { key: 'editorial_blueprint', stage: 'editorial_blueprint', label: 'Plan editorial blueprint' },
  { key: 'rewrite_quality', stage: 'rewrite_quality', label: 'Rewrite + quality checks' },
  { key: 'fact_length', stage: 'fact_length', label: 'Fact retention + length checks' },
  { key: 'editorial_augmentation', stage: 'editorial_augmentation', label: 'Editorial augmentation' },
  { key: 'editorial_post_recheck', stage: 'editorial_post_recheck', label: 'Post-editorial recheck' },
  { key: 'complete', stage: 'complete', label: 'Finalize output' },
]

export const URL2BLOG_TEXT_PROGRESS_STEPS: Url2BlogProgressStep[] = [
  { ...URL2BLOG_PROGRESS_STEPS[0], label: 'Text submitted' },
  { ...URL2BLOG_PROGRESS_STEPS[1], label: 'Stage 1: Clean pasted text' },
  ...URL2BLOG_PROGRESS_STEPS.slice(2),
]
