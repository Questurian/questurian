/**
 * Markdown and HTML to Lexical JSON converter service.
 *
 * Port: 4010
 */

import { createApp } from './app.js'

export {
  htmlToLexical,
  lexicalToHtml,
  lexicalToMarkdown,
  markdownToLexical
} from './conversion/converter.js'

const port = process.env.PORT || 4010

createApp().listen(port, () => {
  console.log(`Lexical Converter running at http://localhost:${port}`)
})
