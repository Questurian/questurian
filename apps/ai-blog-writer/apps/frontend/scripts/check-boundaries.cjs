#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require('node:fs')
const path = require('node:path')

const SRC_ROOT = path.resolve(__dirname, '../src')
const SHARED_ROOT = path.join(SRC_ROOT, 'shared')

const SOURCE_EXTENSIONS = ['', '.ts', '.tsx', '.js', '.jsx']

const allowedCrossFeatureImports = [
  {
    from: /^features\/(?:prompt2blog|url2blog|youtube2blog)\//,
    to: /^features\/staging\/(?:api(?:\.ts|\/index\.ts)?|types\.ts|components\/(?:StageListPage|StandardArticleStageBuilder)\.tsx?)$/,
    reason: 'pipeline pages reuse staging shell',
  },
  {
    from: /^features\/prompt2blog\//,
    to: /^features\/staging\/features\/editorial-stage-article\/services\/standard-article-seo\.service\.ts$/,
    reason: 'prompt stage SEO delegates to staging service',
  },
  {
    from: /^features\/(?:singleTypeListicles|listicleItineraries)\//,
    to: /^features\/staging\/api(?:\.ts|\/index\.ts)?$/,
    reason: 'builder AI helpers still exported by staging API',
  },
  {
    from: /^features\/(?:singleTypeListicles|listicleItineraries)\//,
    to: /^features\/staging\/api\/ai\/rewrite\.(?:api|types)\.ts$/,
    reason: 'builder AI helpers still live in staging API',
  },
  {
    from: /^features\/locationDocuments\//,
    to: /^features\/staging\/(?:api\/external-images\/external-images\.(?:api|types)\.ts|features\/editorial-stage-article\/media-utils\.ts)$/,
    reason: 'location docs image picker shares editorial image helpers',
  },
  {
    from: /^features\/locationDocuments\//,
    to: /^features\/staging\/api(?:\.ts|\/index\.ts)?$/,
    reason: 'location document builder still consumes editor assist model options from staging API',
  },
  {
    from: /^features\/batchImageRecreation\//,
    to: /^features\/imageRecreationPrompts\/config\.ts$/,
    reason: 'batch image recreation reuses prompt preset config',
  },
  {
    from: /^features\/homepageFeaturedContent\//,
    to: /^features\/locationDocuments\/(?:api\.ts|types\.ts)$/,
    reason: 'homepage location picker still uses location document API types',
  },
  {
    from: /^features\/itinerariesPipeline\//,
    to: /^features\/(?:listicleItineraries\/(?:api\.ts|builder\/constants\/builder-options\.constants\.ts|types\.ts|styles\.css)|prompt2blog\/(?:constants\/prompt2blog\.constants\.ts|types\/pipeline\.types\.ts|styles\.css))$/,
    reason: 'pipeline composes listicle and prompt options',
  },
  {
    from: /^features\/staging\//,
    to: /^features\/youtube2blog\/(?:components\/ArticleExpansionModal\.tsx|hooks\/useArticleExpansion\.ts)$/,
    reason: 'staging editor reuses article expansion UI',
  },
  {
    from: /^features\/staging\//,
    to: /^features\/(?:youtube2blog\/styles\/stage\.css|singleTypeListicles\/styles\.css)$/,
    reason: 'staging editor currently reuses legacy feature styles',
  },
]

function isSourceFile(filePath) {
  return /\.(ts|tsx)$/.test(filePath)
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const filePath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(filePath, files)
    } else if (isSourceFile(filePath)) {
      files.push(filePath)
    }
  }
  return files
}

function normalize(filePath) {
  return path.relative(SRC_ROOT, filePath).replaceAll(path.sep, '/')
}

function resolveRelativeImport(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null

  const basePath = path.resolve(path.dirname(fromFile), specifier)
  for (const extension of SOURCE_EXTENSIONS) {
    const filePath = basePath + extension
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return filePath
    }
  }

  for (const extension of SOURCE_EXTENSIONS.slice(1)) {
    const filePath = path.join(basePath, `index${extension}`)
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return filePath
    }
  }

  return null
}

function getFeatureName(srcRelativePath) {
  const match = srcRelativePath.match(/^features\/([^/]+)\//)
  return match?.[1] ?? null
}

function isPublicFeatureEntry(targetPath, targetFeature) {
  return targetPath === `features/${targetFeature}/index.ts`
    || targetPath === `features/${targetFeature}/index.tsx`
}

function isAllowedCrossFeatureImport(sourcePath, targetPath) {
  return allowedCrossFeatureImports.some((rule) => rule.from.test(sourcePath) && rule.to.test(targetPath))
}

function extractImportSpecifiers(sourceText) {
  const specifiers = []
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[^'"()]+?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bexport\s+(?:type\s+)?[^'"]+?\s+from\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bvi\.mock\s*\(\s*['"]([^'"]+)['"]/g,
  ]

  for (const pattern of patterns) {
    for (const match of sourceText.matchAll(pattern)) {
      specifiers.push(match[1])
    }
  }

  return specifiers
}

function checkFile(filePath) {
  const sourcePath = normalize(filePath)
  const sourceText = fs.readFileSync(filePath, 'utf8')
  const violations = []

  for (const specifier of extractImportSpecifiers(sourceText)) {
    const resolvedPath = resolveRelativeImport(filePath, specifier)
    if (!resolvedPath) continue

    const targetPath = normalize(resolvedPath)

    if (filePath.startsWith(SHARED_ROOT) && targetPath.startsWith('features/')) {
      violations.push({
        sourcePath,
        specifier,
        message: 'shared code must not import from features',
      })
      continue
    }

    const sourceFeature = getFeatureName(sourcePath)
    const targetFeature = getFeatureName(targetPath)
    if (!sourceFeature || !targetFeature || sourceFeature === targetFeature) continue

    if (isPublicFeatureEntry(targetPath, targetFeature)) continue
    if (isAllowedCrossFeatureImport(sourcePath, targetPath)) continue

    violations.push({
      sourcePath,
      specifier,
      message: `feature "${sourceFeature}" deep-imports feature "${targetFeature}"`,
    })
  }

  return violations
}

const violations = walk(SRC_ROOT).flatMap(checkFile)

if (violations.length > 0) {
  console.error('Frontend boundary check failed:')
  for (const violation of violations) {
    console.error(`- ${violation.sourcePath}: ${violation.message} via ${violation.specifier}`)
  }
  process.exit(1)
}

console.log('Frontend boundary check passed.')
