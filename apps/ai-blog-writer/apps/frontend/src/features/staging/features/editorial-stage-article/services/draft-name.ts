/**
 * A name that tells one run from another.
 *
 * Drafts are already stored one per run. They only *look* identical because
 * the list shows the article title, and six attempts at the same subject all
 * produce roughly the same title.
 *
 * That matters more than it sounds, because saving is not "was this good" — it
 * is "do I want this for later", and a failure kept deliberately is how the
 * next failure gets diagnosed. A pile of indistinguishable drafts makes the
 * kept failures useless.
 *
 * Built from what actually varies between attempts: the form, the models, and
 * when it ran. Not the title, which is the thing that does not vary.
 */

export interface DraftNameParts {
  /** The article form, e.g. `destination-guide`. */
  formId?: string
  /** The subject, when the run knows it. */
  location?: string
  /** Which models wrote it — the usual reason two runs of one subject differ. */
  models?: (string | undefined)[]
  /** Defaults to now. Passed in so the value is testable. */
  at?: Date
}

function shortModel(model: string): string {
  // "claude-sonnet-5-medium" reads as "sonnet-5" in a list; the vendor prefix
  // is the same on every row and earns no space.
  return model
    .replace(/^(claude|gemini)-/, '')
    .replace(/-(medium|high|low|xhigh|max)$/, '')
}

function stamp(at: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(
    at.getHours(),
  )}:${pad(at.getMinutes())}`
}

export function defaultDraftName({
  formId,
  location,
  models = [],
  at = new Date(),
}: DraftNameParts): string {
  const distinct = [...new Set(models.filter((model): model is string => Boolean(model)))]
  return [location, formId, distinct.map(shortModel).join('+'), stamp(at)]
    .filter(Boolean)
    .join(' · ')
}
