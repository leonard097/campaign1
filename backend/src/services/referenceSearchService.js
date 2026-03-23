import {
  ingestReferenceLibrary,
  ReferenceLibraryError,
} from './referenceLibraryService.js'
import { supportedCanonModes } from './settingsService.js'

const supportedSourceTypes = ['sourcebook', 'adventure', 'homebrew']
const sourceTypeAliasMap = new Map([
  ['sourcebook', 'sourcebook'],
  ['sourcebooks', 'sourcebook'],
  ['adventure', 'adventure'],
  ['adventures', 'adventure'],
  ['homebrew', 'homebrew'],
])
const DEFAULT_REFERENCE_CONTEXT_LIMIT = 3
const MAX_REFERENCE_CONTEXT_CHARS_PER_CHUNK = 420
const queryStopwords = new Set([
  'a',
  'an',
  'and',
  'by',
  'find',
  'for',
  'in',
  'mention',
  'mentioning',
  'mentions',
  'of',
  'or',
  'search',
  'text',
  'the',
  'to',
  'with',
])
const sourcebookAffinityTokens = new Set([
  'class',
  'classes',
  'combat',
  'condition',
  'conditions',
  'feat',
  'feats',
  'grappling',
  'item',
  'items',
  'lore',
  'monster',
  'monsters',
  'rule',
  'rules',
  'spell',
  'spells',
])
const adventureAffinityTokens = new Set([
  'adventure',
  'adventures',
  'chapter',
  'chapters',
  'city',
  'dungeon',
  'encounter',
  'encounters',
  'hook',
  'hooks',
  'location',
  'locations',
  'place',
  'places',
  'quest',
  'quests',
  'region',
  'ruin',
  'ruins',
  'scenario',
  'scenarios',
  'town',
  'travel',
  'village',
])
const searchCanonPriorityWeights = {
  balanced: {
    homebrew: 0,
    sourcebook: 0,
    adventure: 0,
  },
  preferHomebrew: {
    homebrew: 26,
    sourcebook: 2,
    adventure: 0,
  },
  preferOfficialSources: {
    homebrew: -10,
    sourcebook: 18,
    adventure: 14,
  },
  sourcebookAffinity: 10,
  adventureAffinity: 10,
}
const retrievalCanonPriorityWeights = {
  balanced: {
    homebrew: 0,
    sourcebook: 0,
    adventure: 0,
  },
  preferHomebrew: {
    homebrew: 36,
    sourcebook: 4,
    adventure: 1,
  },
  preferOfficialSources: {
    homebrew: -14,
    sourcebook: 22,
    adventure: 18,
  },
  sourcebookAffinity: 12,
  adventureAffinity: 12,
}

class ReferenceSearchError extends Error {
  constructor(message, statusCode = 400) {
    super(message)
    this.name = 'ReferenceSearchError'
    this.statusCode = statusCode
  }
}

function tokenize(text = '') {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .match(/[a-z0-9']+/g)
        ?.filter((token) => token.length >= 2) ?? [],
    ),
  )
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeSearchText(text = '') {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function normalizeSourceType(value = '') {
  if (typeof value !== 'string') {
    throw new ReferenceSearchError('Reference sourceType must be a string.')
  }

  const normalized = value.trim().toLowerCase()

  if (!normalized) {
    return ''
  }

  const alias = sourceTypeAliasMap.get(normalized)

  if (!alias || !supportedSourceTypes.includes(alias)) {
    throw new ReferenceSearchError(
      `Reference sourceType must be one of: ${supportedSourceTypes.join(', ')}.`,
    )
  }

  return alias
}

function normalizeSourceName(value = '') {
  if (typeof value !== 'string') {
    throw new ReferenceSearchError('Reference sourceName must be a string.')
  }

  return value.trim()
}

function normalizeCanonMode(value = 'Balanced') {
  if (typeof value === 'undefined' || value === null || value === '') {
    return 'Balanced'
  }

  if (typeof value !== 'string') {
    throw new ReferenceSearchError('Reference canonMode must be a string.')
  }

  const trimmed = value.trim()

  if (!supportedCanonModes.includes(trimmed)) {
    throw new ReferenceSearchError(
      `Reference canonMode must be one of: ${supportedCanonModes.join(', ')}.`,
    )
  }

  return trimmed
}

function parseSearchLimit(value) {
  if (typeof value === 'undefined') {
    return 20
  }

  const parsed = Number(value)

  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 100) {
    throw new ReferenceSearchError('Reference search limit must be 1-100.')
  }

  return parsed
}

function parseSearchInput({
  query = '',
  sourceType = '',
  sourceName = '',
  canonMode = 'Balanced',
}) {
  if (typeof query !== 'string') {
    throw new ReferenceSearchError('Reference search query must be a string.')
  }

  const rawQuery = query.trim()
  const queryTokens = tokenize(rawQuery)
  const inferredSourceType =
    normalizeSourceType(sourceType) ||
    queryTokens.find((token) => sourceTypeAliasMap.has(token)) ||
    ''
  const normalizedSourceType = inferredSourceType
    ? sourceTypeAliasMap.get(inferredSourceType) ?? inferredSourceType
    : ''
  const normalizedSourceName = normalizeSourceName(sourceName)
  const searchTokens = queryTokens.filter(
    (token) =>
      !sourceTypeAliasMap.has(token) &&
      !queryStopwords.has(token),
  )
  const normalizedQuery = searchTokens.join(' ')
  const queryPhrases = buildQueryPhrases(rawQuery, searchTokens)

  return {
    rawQuery,
    normalizedQuery,
    queryTokens: searchTokens,
    queryPhrases,
    sourceType: normalizedSourceType,
    sourceName: normalizedSourceName,
    canonMode: normalizeCanonMode(canonMode),
  }
}

function buildQueryPhrases(rawQuery, queryTokens) {
  const phrases = new Set()
  const normalizedRawQuery = normalizeSearchText(rawQuery)

  if (normalizedRawQuery.length >= 3) {
    phrases.add(normalizedRawQuery)
  }

  for (const token of queryTokens) {
    phrases.add(normalizeSearchText(token))
  }

  for (let size = 2; size <= Math.min(queryTokens.length, 4); size += 1) {
    for (let index = 0; index <= queryTokens.length - size; index += 1) {
      const phrase = normalizeSearchText(queryTokens.slice(index, index + size).join(' '))

      if (phrase.length >= 3) {
        phrases.add(phrase)
      }
    }
  }

  const quotedPhrases = rawQuery.match(/"([^"]+)"/gu) ?? []

  for (const phrase of quotedPhrases) {
    const normalizedPhrase = normalizeSearchText(phrase.replaceAll('"', ''))

    if (normalizedPhrase.length >= 3) {
      phrases.add(normalizedPhrase)
    }
  }

  return Array.from(phrases)
}

function countOccurrences(text, token) {
  return text.match(new RegExp(escapeRegExp(token), 'gu'))?.length ?? 0
}

function scoreField(text, query, tokens, weights) {
  if (!text) {
    return 0
  }

  const normalizedText = text.toLowerCase()
  let score = 0

  if (query && query.length >= 3 && normalizedText.includes(query)) {
    score += weights.phraseBonus
  }

  for (const token of tokens) {
    const occurrences = countOccurrences(normalizedText, token)

    if (!occurrences) {
      continue
    }

    score += weights.matchBonus
    score += Math.min(occurrences - 1, weights.repeatCap) * weights.repeatBonus
  }

  return Math.min(score, weights.maxScore)
}

function filterMatchesSourceName(sourceName, filterValue) {
  if (!filterValue) {
    return true
  }

  return sourceName.toLowerCase().includes(filterValue.toLowerCase())
}

function buildSearchResult(document, bestChunk, scores) {
  return {
    documentId: document.id,
    title: document.title,
    sourceType: document.sourceType,
    sourceName: document.sourceName,
    filePath: document.filePath,
    shortSummary: document.shortSummary,
    headings: document.headings,
    tags: document.tags,
    score: scores.total,
    match: {
      title: scores.title,
      heading: scores.heading,
      body: scores.body,
    },
    bestChunk: bestChunk
      ? {
          chunkId: bestChunk.chunkId,
          headingPath: bestChunk.headingPath,
          text: bestChunk.text,
          estimatedTokens: bestChunk.estimatedTokens,
        }
      : null,
  }
}

function truncateContextSnippet(text, maxLength = MAX_REFERENCE_CONTEXT_CHARS_PER_CHUNK) {
  const normalized = text.replace(/\s+/gu, ' ').trim()

  if (normalized.length <= maxLength) {
    return normalized
  }

  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`
}

function sortSearchResults(left, right) {
  if (left.score !== right.score) {
    return right.score - left.score
  }

  if (left.match.title !== right.match.title) {
    return right.match.title - left.match.title
  }

  if (left.match.heading !== right.match.heading) {
    return right.match.heading - left.match.heading
  }

  if (left.match.body !== right.match.body) {
    return right.match.body - left.match.body
  }

  return left.title.localeCompare(right.title)
}

function buildChunkMap(chunks) {
  const chunkMap = new Map()

  for (const chunk of chunks) {
    if (!chunkMap.has(chunk.documentId)) {
      chunkMap.set(chunk.documentId, [])
    }

    chunkMap.get(chunk.documentId).push(chunk)
  }

  return chunkMap
}

function scoreExactPhraseMatches(fieldText, queryPhrases, weights) {
  const normalizedField = normalizeSearchText(fieldText)

  if (!normalizedField) {
    return 0
  }

  let score = 0

  for (const phrase of queryPhrases) {
    if (!phrase) {
      continue
    }

    if (normalizedField === phrase) {
      score += weights.exact
      continue
    }

    if (normalizedField.includes(phrase)) {
      score += weights.includes
    }
  }

  return score
}

function scoreExactArrayMatches(values, queryPhrases, weights) {
  return values.reduce(
    (total, value) => total + scoreExactPhraseMatches(value, queryPhrases, weights),
    0,
  )
}

function queryContainsAnyToken(queryTokens, tokenSet) {
  return queryTokens.some((token) => tokenSet.has(token))
}

function scoreSourcePriority(sourceType, canonMode, queryTokens, weights) {
  let score = 0

  if (canonMode === 'Prefer Homebrew') {
    score += weights.preferHomebrew[sourceType] ?? 0
  } else if (canonMode === 'Prefer Official Sources') {
    score += weights.preferOfficialSources[sourceType] ?? 0
  } else {
    score += weights.balanced[sourceType] ?? 0
  }

  if (sourceType === 'sourcebook' && queryContainsAnyToken(queryTokens, sourcebookAffinityTokens)) {
    score += weights.sourcebookAffinity
  }

  if (sourceType === 'adventure' && queryContainsAnyToken(queryTokens, adventureAffinityTokens)) {
    score += weights.adventureAffinity
  }

  return score
}

function scoreChunk(chunk, normalizedQuery, queryTokens) {
  const headingText = chunk.headingPath.join(' > ')
  const headingScore = scoreField(headingText, normalizedQuery, queryTokens, {
    phraseBonus: 18,
    matchBonus: 12,
    repeatBonus: 4,
    repeatCap: 2,
    maxScore: 80,
  })
  const bodyScore = scoreField(chunk.text, normalizedQuery, queryTokens, {
    phraseBonus: 8,
    matchBonus: 4,
    repeatBonus: 2,
    repeatCap: 4,
    maxScore: 60,
  })

  return {
    heading: headingScore,
    body: bodyScore,
    total: headingScore + bodyScore,
  }
}

function scoreReferenceContextChunk(document, chunk, parsedInput) {
  const titleScore = scoreField(document.title, parsedInput.normalizedQuery, parsedInput.queryTokens, {
    phraseBonus: 34,
    matchBonus: 22,
    repeatBonus: 6,
    repeatCap: 2,
    maxScore: 140,
  })
  const headingText = chunk.headingPath.join(' > ')
  const headingScore = scoreField(headingText, parsedInput.normalizedQuery, parsedInput.queryTokens, {
    phraseBonus: 28,
    matchBonus: 18,
    repeatBonus: 5,
    repeatCap: 2,
    maxScore: 120,
  })
  const bodyScore = scoreField(chunk.text, parsedInput.normalizedQuery, parsedInput.queryTokens, {
    phraseBonus: 12,
    matchBonus: 6,
    repeatBonus: 2,
    repeatCap: 4,
    maxScore: 70,
  })
  const tagScore = scoreField(chunk.tags.join(' '), parsedInput.normalizedQuery, parsedInput.queryTokens, {
    phraseBonus: 18,
    matchBonus: 10,
    repeatBonus: 3,
    repeatCap: 2,
    maxScore: 60,
  })
  const exactScore =
    scoreExactPhraseMatches(document.title, parsedInput.queryPhrases, {
      exact: 90,
      includes: 36,
    }) +
    scoreExactPhraseMatches(headingText, parsedInput.queryPhrases, {
      exact: 76,
      includes: 30,
    }) +
    scoreExactArrayMatches(chunk.headingPath, parsedInput.queryPhrases, {
      exact: 68,
      includes: 24,
    }) +
    scoreExactArrayMatches(chunk.tags, parsedInput.queryPhrases, {
      exact: 40,
      includes: 16,
    })
  const sourcePriority = scoreSourcePriority(
    document.sourceType,
    parsedInput.canonMode,
    parsedInput.queryTokens,
    retrievalCanonPriorityWeights,
  )

  return {
    title: titleScore,
    heading: headingScore,
    body: bodyScore,
    tag: tagScore,
    exact: exactScore,
    sourcePriority,
    total:
      titleScore +
      headingScore +
      bodyScore +
      tagScore +
      exactScore +
      sourcePriority,
  }
}

function scoreDocument(document, normalizedQuery, queryTokens, chunks, canonMode) {
  const titleScore = scoreField(document.title, normalizedQuery, queryTokens, {
    phraseBonus: 30,
    matchBonus: 20,
    repeatBonus: 6,
    repeatCap: 2,
    maxScore: 120,
  })
  const documentHeadingScore = scoreField(
    document.headings.join(' | '),
    normalizedQuery,
    queryTokens,
    {
      phraseBonus: 18,
      matchBonus: 12,
      repeatBonus: 4,
      repeatCap: 2,
      maxScore: 80,
    },
  )

  let bestChunk = null
  let bestChunkScores = {
    heading: 0,
    body: 0,
    total: 0,
  }

  for (const chunk of chunks) {
    const chunkScores = scoreChunk(chunk, normalizedQuery, queryTokens)

    if (
      chunkScores.total > bestChunkScores.total ||
      (chunkScores.total === bestChunkScores.total &&
        chunkScores.body > bestChunkScores.body)
    ) {
      bestChunk = chunk
      bestChunkScores = chunkScores
    }
  }

  const headingScore = Math.max(documentHeadingScore, bestChunkScores.heading)
  const bodyScore = bestChunkScores.body
  const fallbackChunk = bestChunk || chunks[0] || null
  const sourcePriority = scoreSourcePriority(
    document.sourceType,
    canonMode,
    queryTokens,
    searchCanonPriorityWeights,
  )

  return {
    bestChunk: fallbackChunk,
    scores: {
      title: titleScore,
      heading: headingScore,
      body: bodyScore,
      sourcePriority,
      total: titleScore + headingScore + bodyScore + sourcePriority,
    },
  }
}

async function loadSearchData() {
  const { records, chunks } = await ingestReferenceLibrary()

  return {
    records,
    chunks,
    chunkMap: buildChunkMap(chunks),
  }
}

export async function searchReferences({
  query = '',
  sourceType = '',
  sourceName = '',
  canonMode = 'Balanced',
  limit,
} = {}) {
  const normalizedLimit = parseSearchLimit(limit)
  const parsedInput = parseSearchInput({
    query,
    sourceType,
    sourceName,
    canonMode,
  })
  const { records, chunks, chunkMap } = await loadSearchData()
  const filteredDocuments = records.filter(
    (record) =>
      (!parsedInput.sourceType || record.sourceType === parsedInput.sourceType) &&
      filterMatchesSourceName(record.sourceName, parsedInput.sourceName),
  )

  const results = []

  for (const document of filteredDocuments) {
    const documentChunks =
      chunkMap.get(document.id)?.filter(
        (chunk) =>
          (!parsedInput.sourceType || chunk.sourceType === parsedInput.sourceType) &&
          filterMatchesSourceName(chunk.sourceName, parsedInput.sourceName),
      ) ?? []
    const { bestChunk, scores } = scoreDocument(
      document,
      parsedInput.normalizedQuery,
      parsedInput.queryTokens,
      documentChunks,
      parsedInput.canonMode,
    )

    if (parsedInput.queryTokens.length && scores.total <= 0) {
      continue
    }

    results.push(buildSearchResult(document, bestChunk, scores))
  }

  return {
    query: parsedInput.rawQuery,
    normalizedQuery: parsedInput.normalizedQuery,
    sourceType: parsedInput.sourceType || null,
    sourceName: parsedInput.sourceName || null,
    canonMode: parsedInput.canonMode,
    total: results.length,
    items: results.sort(sortSearchResults).slice(0, normalizedLimit),
    availableSourceTypes: supportedSourceTypes,
  }
}

export async function getReferenceDocumentById(documentId) {
  if (typeof documentId !== 'string' || !documentId.trim()) {
    throw new ReferenceSearchError('Reference document id is required.')
  }

  const { records } = await loadSearchData()
  const document = records.find((record) => record.id === documentId.trim())

  if (!document) {
    throw new ReferenceSearchError('Reference document was not found.', 404)
  }

  return document
}

export async function getReferenceChunkById(chunkId) {
  if (typeof chunkId !== 'string' || !chunkId.trim()) {
    throw new ReferenceSearchError('Reference chunk id is required.')
  }

  const { chunks } = await loadSearchData()
  const chunk = chunks.find((entry) => entry.chunkId === chunkId.trim())

  if (!chunk) {
    throw new ReferenceSearchError('Reference chunk was not found.', 404)
  }

  return chunk
}

export async function retrieveReferenceContext({
  query = '',
  sourceType = '',
  sourceName = '',
  canonMode = 'Balanced',
  limit = DEFAULT_REFERENCE_CONTEXT_LIMIT,
} = {}) {
  const parsedInput = parseSearchInput({
    query,
    sourceType,
    sourceName,
    canonMode,
  })

  if (!parsedInput.rawQuery || !parsedInput.queryTokens.length) {
    return {
      text: '',
      chunks: [],
      canonMode: parsedInput.canonMode,
    }
  }

  const normalizedLimit = Number(limit)

  if (!Number.isInteger(normalizedLimit) || normalizedLimit <= 0 || normalizedLimit > 10) {
    throw new ReferenceSearchError('Reference context limit must be 1-10.')
  }

  const { records, chunkMap } = await loadSearchData()
  const candidates = []

  for (const document of records) {
    if (parsedInput.sourceType && document.sourceType !== parsedInput.sourceType) {
      continue
    }

    if (!filterMatchesSourceName(document.sourceName, parsedInput.sourceName)) {
      continue
    }

    const documentChunks =
      chunkMap.get(document.id)?.filter(
        (chunk) =>
          (!parsedInput.sourceType || chunk.sourceType === parsedInput.sourceType) &&
          filterMatchesSourceName(chunk.sourceName, parsedInput.sourceName),
      ) ?? []

    for (const chunk of documentChunks) {
      const score = scoreReferenceContextChunk(document, chunk, parsedInput)

      if (score.total <= 0) {
        continue
      }

      candidates.push({
        document,
        chunk,
        score,
      })
    }
  }

  candidates.sort((left, right) => {
    if (left.score.total !== right.score.total) {
      return right.score.total - left.score.total
    }

    if (left.score.exact !== right.score.exact) {
      return right.score.exact - left.score.exact
    }

    if (left.score.heading !== right.score.heading) {
      return right.score.heading - left.score.heading
    }

    if (left.score.title !== right.score.title) {
      return right.score.title - left.score.title
    }

    return left.document.title.localeCompare(right.document.title)
  })

  const selected = []
  const perDocumentCounts = new Map()

  for (const candidate of candidates) {
    const currentCount = perDocumentCounts.get(candidate.document.id) ?? 0

    if (currentCount >= 2) {
      continue
    }

    selected.push(candidate)
    perDocumentCounts.set(candidate.document.id, currentCount + 1)

    if (selected.length >= normalizedLimit) {
      break
    }
  }

  if (!selected.length) {
    return {
      text: '',
      chunks: [],
      canonMode: parsedInput.canonMode,
    }
  }

  return {
    text: [
      'Reference Context:',
      `Canon Mode: ${parsedInput.canonMode}`,
      ...selected.map(({ document, chunk }) =>
        [
          `- ${document.title} [${document.sourceType}: ${document.sourceName}]`,
          `  Heading: ${chunk.headingPath.join(' > ') || document.title}`,
          `  Context: ${truncateContextSnippet(chunk.text)}`,
        ].join('\n'),
      ),
    ].join('\n'),
    canonMode: parsedInput.canonMode,
    chunks: selected.map(({ document, chunk, score }) => ({
      chunkId: chunk.chunkId,
      documentId: document.id,
      title: document.title,
      sourceType: document.sourceType,
      sourceName: document.sourceName,
      headingPath: chunk.headingPath,
      text: truncateContextSnippet(chunk.text),
      filePath: chunk.filePath,
      score: score.total,
    })),
  }
}

export {
  ReferenceLibraryError,
  ReferenceSearchError,
  supportedSourceTypes,
}
