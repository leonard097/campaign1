import {
  ingestReferenceLibrary,
  ReferenceLibraryError,
} from './referenceLibraryService.js'

const supportedSourceTypes = ['sourcebook', 'adventure', 'homebrew']
const sourceTypeAliasMap = new Map([
  ['sourcebook', 'sourcebook'],
  ['sourcebooks', 'sourcebook'],
  ['adventure', 'adventure'],
  ['adventures', 'adventure'],
  ['homebrew', 'homebrew'],
])
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

function parseSearchInput({ query = '', sourceType = '', sourceName = '' }) {
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

  return {
    rawQuery,
    normalizedQuery,
    queryTokens: searchTokens,
    sourceType: normalizedSourceType,
    sourceName: normalizedSourceName,
  }
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

function scoreDocument(document, normalizedQuery, queryTokens, chunks) {
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

  return {
    bestChunk: fallbackChunk,
    scores: {
      title: titleScore,
      heading: headingScore,
      body: bodyScore,
      total: titleScore + headingScore + bodyScore,
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
  limit,
} = {}) {
  const normalizedLimit = parseSearchLimit(limit)
  const parsedInput = parseSearchInput({
    query,
    sourceType,
    sourceName,
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

export {
  ReferenceLibraryError,
  ReferenceSearchError,
  supportedSourceTypes,
}
