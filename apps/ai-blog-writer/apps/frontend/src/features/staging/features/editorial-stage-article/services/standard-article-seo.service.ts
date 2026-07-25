/**
 * SEO for standard (editorial) articles.
 *
 * Kept as the single entry point — the boundaries rules allow prompt2blog to
 * import exactly this path, and four other modules import it too. The pieces:
 * - standard-article-seo.helpers.ts               local text/JSON helpers
 * - standard-article-structured-data.service.ts   JSON-LD template building
 * - standard-article-seo-prompt.service.ts        AI prompt construction
 * - standard-article-seo-validation.service.ts    SEO section validation
 */

export {
  buildLegacyStandardArticleStructuredDataTemplate,
  buildStandardArticleContext,
  buildStandardArticleStructuredDataTemplate,
  serializeStandardArticleStructuredDataTemplate,
  shouldAutoManageStandardArticleStructuredData,
} from './standard-article-structured-data.service'

export { buildStandardArticleSeoAiPrompt } from './standard-article-seo-prompt.service'

export {
  isSeoCoreComplete,
  validateStandardArticleSeoSection,
} from './standard-article-seo-validation.service'
