import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  dataDirectoryPath,
  ensureStorageStructure,
  referenceCollectionDirectoryNames,
  referenceDirectoryName,
  saveFile,
} from './storageService.js'

const referenceRootPath = path.join(dataDirectoryPath, referenceDirectoryName)
const referenceIndexPath = path.posix.join(
  referenceDirectoryName,
  'indexes',
  'reference-index.json',
)
const headingsIndexPath = path.posix.join(
  referenceDirectoryName,
  'indexes',
  'headings-index.json',
)
const referenceChunksIndexPath = path.posix.join(
  referenceDirectoryName,
  'indexes',
  'reference-chunks.json',
)

const sourceTypeByDirectory = {
  sourcebooks: 'sourcebook',
  adventures: 'adventure',
  homebrew: 'homebrew',
  indexes: 'unknown',
}

const MAX_CHUNK_TOKENS = 350

class ReferenceLibraryError extends Error {
  constructor(message, statusCode = 400) {
    super(message)
    this.name = 'ReferenceLibraryError'
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

function humanizeName(value = '') {
  return value
    .replace(/\.[^.]+$/u, '')
    .replace(/[_-]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function slugify(value = '') {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
}

function removeFrontmatter(markdown = '') {
  return markdown.replace(/^---[\s\S]*?---\s*/u, '')
}

function normalizeReferenceCategory(category = '') {
  if (typeof category !== 'string') {
    throw new ReferenceLibraryError('Reference category must be a string.')
  }

  const trimmed = category.replaceAll('\\', '/').trim()

  if (!trimmed) {
    return ''
  }

  const normalized = path.posix.normalize(trimmed)

  if (!referenceCollectionDirectoryNames.includes(normalized)) {
    throw new ReferenceLibraryError(
      `Reference category must be one of: ${referenceCollectionDirectoryNames.join(', ')}.`,
    )
  }

  return normalized
}

function normalizeReferencePath(relativePath) {
  if (typeof relativePath !== 'string') {
    throw new ReferenceLibraryError('Reference path must be a string.')
  }

  const sanitized = relativePath.replaceAll('\\', '/').trim()
  const normalized = path.posix.normalize(sanitized)

  if (
    !normalized ||
    normalized === '.' ||
    path.posix.isAbsolute(normalized) ||
    /^[A-Za-z]:\//.test(sanitized) ||
    normalized.startsWith('../') ||
    normalized === '..' ||
    normalized.includes('/../')
  ) {
    throw new ReferenceLibraryError(
      'Reference path must stay inside /data/reference.',
    )
  }

  const scopedPath = normalized.startsWith(`${referenceDirectoryName}/`)
    ? normalized
    : path.posix.join(referenceDirectoryName, normalized)
  const segments = scopedPath.split('/')

  if (
    segments.length < 3 ||
    segments[0] !== referenceDirectoryName ||
    !referenceCollectionDirectoryNames.includes(segments[1])
  ) {
    throw new ReferenceLibraryError(
      'Reference path must point to a markdown file inside /data/reference.',
    )
  }

  if (path.extname(scopedPath).toLowerCase() !== '.md') {
    throw new ReferenceLibraryError('Reference files must use the .md extension.')
  }

  return scopedPath
}

function buildReferenceMetadataFromStats(relativePath, stats) {
  const segments = relativePath.split('/')

  return {
    category: segments[1],
    filePath: relativePath,
    filename: path.basename(relativePath),
    updatedAt: stats.mtime.toISOString(),
    size: stats.size,
  }
}

async function walkMarkdownFiles(directoryPath) {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue
    }

    const fullPath = path.join(directoryPath, entry.name)

    if (entry.isDirectory()) {
      files.push(...(await walkMarkdownFiles(fullPath)))
      continue
    }

    if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.md') {
      files.push(fullPath)
    }
  }

  return files
}

function toReferenceRelativePath(fullPath) {
  return path.relative(dataDirectoryPath, fullPath).split(path.sep).join('/')
}

function extractHeadingDetails(markdown) {
  const headingPattern = /^(#{1,6})[ \t]+(.+?)\s*#*\s*$/gmu
  const headings = []
  const content = removeFrontmatter(markdown).replace(/```[\s\S]*?```/gu, ' ')
  let match

  while ((match = headingPattern.exec(content)) !== null) {
    const text = match[2].trim()

    if (!text) {
      continue
    }

    headings.push({
      level: match[1].length,
      text,
      slug: slugify(text),
      start: match.index,
      contentStart: match.index + match[0].length,
    })
  }

  return headings
}

function buildReferenceId(relativePath) {
  return createHash('sha1').update(relativePath).digest('hex').slice(0, 16)
}

function buildChunkId(documentId, headingPath, text, chunkNumber) {
  return createHash('sha1')
    .update(`${documentId}:${chunkNumber}:${headingPath.join('>')}:${text}`)
    .digest('hex')
    .slice(0, 20)
}

function inferSourceType(relativePath) {
  const category = relativePath.split('/')[1]

  return sourceTypeByDirectory[category] ?? 'unknown'
}

function inferSourceName(relativePath, title) {
  const segments = relativePath.split('/')
  const parentDirectories = segments.slice(2, -1)

  if (parentDirectories.length > 0) {
    return humanizeName(parentDirectories[parentDirectories.length - 1])
  }

  const filename = path.basename(relativePath, path.extname(relativePath))
  const separators = [' - ', ' -- ', '__', ': ']

  for (const separator of separators) {
    if (!filename.includes(separator)) {
      continue
    }

    const candidate = humanizeName(filename.split(separator)[0])

    if (candidate) {
      return candidate
    }
  }

  const titlePrefix = title.match(/^(.{3,80}?)\s*(?:[:\-])/u)?.[1]?.trim()

  if (titlePrefix) {
    return titlePrefix
  }

  return humanizeName(filename)
}

function inferTags(relativePath, headingDetails, sourceType) {
  const segments = relativePath.split('/')
  const folderTags = segments
    .slice(1, -1)
    .map((segment) => slugify(segment))
    .filter(Boolean)
  const headingTags = headingDetails.map((heading) => heading.slug).filter(Boolean)
  const sourceTypeTag = slugify(sourceType)

  return Array.from(
    new Set([...folderTags, ...(sourceTypeTag ? [sourceTypeTag] : []), ...headingTags]),
  )
}

function buildShortSummary(markdown, title) {
  const cleaned = removeFrontmatter(markdown)
    .replace(/```[\s\S]*?```/gu, ' ')
    .replace(/^#{1,6}[ \t]+.+$/gmu, ' ')
    .replace(/^>\s*/gmu, '')
    .replace(/^[-*+]\s+/gmu, '')
    .replace(/\s+/gu, ' ')
    .trim()

  if (!cleaned) {
    return title
  }

  const summary = cleaned.startsWith(title)
    ? cleaned.slice(title.length).trim()
    : cleaned

  if (!summary) {
    return title
  }

  return summary.length <= 280
    ? summary
    : `${summary.slice(0, 277).trimEnd()}...`
}

function normalizeChunkText(markdown = '') {
  return markdown
    .replace(/```[\s\S]*?```/gu, ' ')
    .replace(/`([^`]+)`/gu, '$1')
    .replace(/!\[[^\]]*\]\([^)]+\)/gu, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, '$1')
    .replace(/^>\s*/gmu, '')
    .replace(/^[-*+]\s+/gmu, '')
    .replace(/^\d+\.\s+/gmu, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .replace(/[ \t]{2,}/gu, ' ')
    .trim()
}

function estimateTokens(text = '') {
  const normalized = text.trim()

  return normalized ? Math.max(1, Math.ceil(normalized.length / 4)) : 0
}

function splitParagraphIntoSentenceChunks(paragraph) {
  const sentences =
    paragraph.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/gu)?.map((sentence) => sentence.trim()) ??
    [paragraph.trim()]
  const chunks = []
  let currentChunk = ''

  for (const sentence of sentences.filter(Boolean)) {
    const candidate = currentChunk ? `${currentChunk} ${sentence}` : sentence

    if (estimateTokens(candidate) <= MAX_CHUNK_TOKENS) {
      currentChunk = candidate
      continue
    }

    if (currentChunk) {
      chunks.push(currentChunk)
      currentChunk = ''
    }

    if (estimateTokens(sentence) <= MAX_CHUNK_TOKENS) {
      currentChunk = sentence
      continue
    }

    const words = sentence.split(/\s+/u).filter(Boolean)
    let currentWordChunk = ''

    for (const word of words) {
      const wordCandidate = currentWordChunk ? `${currentWordChunk} ${word}` : word

      if (estimateTokens(wordCandidate) <= MAX_CHUNK_TOKENS) {
        currentWordChunk = wordCandidate
        continue
      }

      if (currentWordChunk) {
        chunks.push(currentWordChunk)
      }

      currentWordChunk = word
    }

    if (currentWordChunk) {
      chunks.push(currentWordChunk)
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk)
  }

  return chunks
}

function splitSectionIntoChunkTexts(text) {
  const normalized = normalizeChunkText(text)

  if (!normalized) {
    return []
  }

  if (estimateTokens(normalized) <= MAX_CHUNK_TOKENS) {
    return [normalized]
  }

  const paragraphs = normalized.split(/\n{2,}/u).map((paragraph) => paragraph.trim())
  const chunks = []
  let currentChunk = ''

  for (const paragraph of paragraphs.filter(Boolean)) {
    const candidate = currentChunk ? `${currentChunk}\n\n${paragraph}` : paragraph

    if (estimateTokens(candidate) <= MAX_CHUNK_TOKENS) {
      currentChunk = candidate
      continue
    }

    if (currentChunk) {
      chunks.push(currentChunk)
      currentChunk = ''
    }

    if (estimateTokens(paragraph) <= MAX_CHUNK_TOKENS) {
      currentChunk = paragraph
      continue
    }

    chunks.push(...splitParagraphIntoSentenceChunks(paragraph))
  }

  if (currentChunk) {
    chunks.push(currentChunk)
  }

  return chunks
}

function buildHeadingSections(markdown, title, headingDetails) {
  const content = removeFrontmatter(markdown)
  const sections = []

  if (!headingDetails.length) {
    const text = normalizeChunkText(content)

    return text
      ? [
          {
            headingPath: [title],
            text,
          },
        ]
      : []
  }

  const introText = normalizeChunkText(content.slice(0, headingDetails[0].start))

  if (introText) {
    sections.push({
      headingPath: [title],
      text: introText,
    })
  }

  const headingStack = []

  for (let index = 0; index < headingDetails.length; index += 1) {
    const heading = headingDetails[index]

    while (
      headingStack.length &&
      headingStack[headingStack.length - 1].level >= heading.level
    ) {
      headingStack.pop()
    }

    headingStack.push({
      level: heading.level,
      text: heading.text,
    })

    const nextHeadingStart = headingDetails[index + 1]?.start ?? content.length
    const text = normalizeChunkText(
      content.slice(heading.contentStart, nextHeadingStart),
    )

    if (!text) {
      continue
    }

    sections.push({
      headingPath: headingStack.map((entry) => entry.text),
      text,
    })
  }

  return sections
}

function buildHeadingIndexEntries(record, headingDetails) {
  return headingDetails.map((heading, index) => ({
    id: `${record.id}:heading:${index + 1}`,
    heading: heading.text,
    slug: heading.slug,
    level: heading.level,
    fileId: record.id,
    filePath: record.filePath,
    title: record.title,
    sourceType: record.sourceType,
    sourceName: record.sourceName,
    tags: record.tags,
  }))
}

function buildChunkIndexEntries(record, sections) {
  const chunks = []
  let chunkNumber = 0

  for (const section of sections) {
    const sectionTags = Array.from(
      new Set([...record.tags, ...section.headingPath.map((heading) => slugify(heading))]),
    )

    for (const text of splitSectionIntoChunkTexts(section.text)) {
      chunkNumber += 1

      chunks.push({
        chunkId: buildChunkId(record.id, section.headingPath, text, chunkNumber),
        documentId: record.id,
        title: record.title,
        sourceType: record.sourceType,
        sourceName: record.sourceName,
        headingPath: section.headingPath,
        text,
        estimatedTokens: estimateTokens(text),
        tags: sectionTags,
        filePath: record.filePath,
      })
    }
  }

  return chunks
}

function parseReferenceRecord(relativePath, markdown, stats) {
  const headingDetails = extractHeadingDetails(markdown)
  const title =
    headingDetails.find((heading) => heading.level === 1)?.text ||
    humanizeName(path.basename(relativePath))
  const sourceType = inferSourceType(relativePath)
  const sourceName = inferSourceName(relativePath, title)
  const tags = inferTags(relativePath, headingDetails, sourceType)

  const record = {
    id: buildReferenceId(relativePath),
    title,
    sourceType,
    sourceName,
    ...buildReferenceMetadataFromStats(relativePath, stats),
    headings: headingDetails.map((heading) => heading.text),
    tags,
    shortSummary: buildShortSummary(markdown, title),
    fullRawMarkdown: markdown,
  }
  const sections = buildHeadingSections(markdown, title, headingDetails)

  return {
    record,
    headings: buildHeadingIndexEntries(record, headingDetails),
    chunks: buildChunkIndexEntries(record, sections),
  }
}

async function parseReferenceFile(fullPath) {
  const stats = await fs.stat(fullPath)
  const relativePath = toReferenceRelativePath(fullPath)
  const markdown = await fs.readFile(fullPath, 'utf8')

  return parseReferenceRecord(relativePath, markdown, stats)
}

async function readReferenceFile(relativePath) {
  const normalizedPath = normalizeReferencePath(relativePath)
  const filePath = path.resolve(dataDirectoryPath, normalizedPath)

  try {
    const [content, stats] = await Promise.all([
      fs.readFile(filePath, 'utf8'),
      fs.stat(filePath),
    ])

    return parseReferenceRecord(normalizedPath, content, stats).record
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new ReferenceLibraryError('Reference file was not found.', 404)
    }

    throw error
  }
}

function sortReferenceMetadata(left, right) {
  const updatedAtDifference =
    new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()

  if (updatedAtDifference !== 0) {
    return updatedAtDifference
  }

  return left.filePath.localeCompare(right.filePath)
}

function sortHeadingEntries(left, right) {
  const slugComparison = left.slug.localeCompare(right.slug)

  if (slugComparison !== 0) {
    return slugComparison
  }

  if (left.filePath !== right.filePath) {
    return left.filePath.localeCompare(right.filePath)
  }

  return left.level - right.level
}

async function writeReferenceIndexes(records, headings, chunks, generatedAt) {
  await Promise.all([
    saveFile(referenceIndexPath, {
      generatedAt,
      recordCount: records.length,
      records,
    }),
    saveFile(headingsIndexPath, {
      generatedAt,
      headingCount: headings.length,
      headings,
    }),
    saveFile(referenceChunksIndexPath, {
      generatedAt,
      chunkCount: chunks.length,
      chunks,
    }),
  ])
}

function toReferenceSearchResult(record, score = 0) {
  return {
    id: record.id,
    title: record.title,
    sourceType: record.sourceType,
    sourceName: record.sourceName,
    filePath: record.filePath,
    filename: record.filename,
    updatedAt: record.updatedAt,
    headings: record.headings,
    tags: record.tags,
    shortSummary: record.shortSummary,
    score,
  }
}

function scoreReferenceMatch(reference, markdown, queryTokens) {
  if (!queryTokens.length) {
    return 0
  }

  const normalizedPath = reference.filePath.toLowerCase()
  const normalizedFilename = reference.filename.toLowerCase()
  const content = markdown.toLowerCase()
  const headings = reference.headings.join(' ').toLowerCase()
  const tags = reference.tags.join(' ').toLowerCase()
  const title = reference.title.toLowerCase()
  const sourceName = reference.sourceName.toLowerCase()
  const summary = reference.shortSummary.toLowerCase()
  let score = 0

  for (const token of queryTokens) {
    if (title.includes(token)) {
      score += 10
    }

    if (normalizedFilename.includes(token)) {
      score += 8
    }

    if (normalizedPath.includes(token)) {
      score += 4
    }

    if (sourceName.includes(token)) {
      score += 4
    }

    if (tags.includes(token)) {
      score += 5
    }

    if (headings.includes(token)) {
      score += 6
    }

    if (summary.includes(token)) {
      score += 3
    }

    const matches = content.match(new RegExp(escapeRegExp(token), 'gu'))?.length ?? 0
    score += Math.min(matches, 8)
  }

  return score
}

export async function ingestReferenceLibrary() {
  await ensureStorageStructure()

  const filePaths = (await walkMarkdownFiles(referenceRootPath)).sort((left, right) =>
    left.localeCompare(right),
  )
  const parsedFiles = await Promise.all(filePaths.map(parseReferenceFile))
  const records = parsedFiles
    .map((entry) => entry.record)
    .sort(sortReferenceMetadata)
  const headings = parsedFiles
    .flatMap((entry) => entry.headings)
    .sort(sortHeadingEntries)
  const chunks = parsedFiles
    .flatMap((entry) => entry.chunks)
  const generatedAt = new Date().toISOString()

  await writeReferenceIndexes(records, headings, chunks, generatedAt)

  return {
    generatedAt,
    records,
    headings,
    chunks,
  }
}

export async function scanReferenceSources({ category = '' } = {}) {
  const normalizedCategory = normalizeReferenceCategory(category)
  const { records } = await ingestReferenceLibrary()

  return normalizedCategory
    ? records.filter((record) => record.category === normalizedCategory)
    : records
}

export async function readReferenceMarkdown(relativePath) {
  await ensureStorageStructure()

  return readReferenceFile(relativePath)
}

export async function searchReferenceSources({
  query = '',
  category = '',
  limit = 25,
} = {}) {
  if (typeof query !== 'string') {
    throw new ReferenceLibraryError('Reference search query must be a string.')
  }

  const numericLimit = Number(limit)

  if (!Number.isInteger(numericLimit) || numericLimit <= 0 || numericLimit > 100) {
    throw new ReferenceLibraryError('Reference search limit must be 1-100.')
  }

  const files = await scanReferenceSources({ category })
  const queryTokens = tokenize(query.trim())

  if (!queryTokens.length) {
    return files.slice(0, numericLimit).map((file) => toReferenceSearchResult(file))
  }

  const rankedResults = []

  for (const file of files) {
    const score = scoreReferenceMatch(file, file.fullRawMarkdown, queryTokens)

    if (score <= 0) {
      continue
    }

    rankedResults.push(toReferenceSearchResult(file, score))
  }

  return rankedResults
    .sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score
      }

      return sortReferenceMetadata(left, right)
    })
    .slice(0, numericLimit)
}

export {
  ReferenceLibraryError,
  headingsIndexPath,
  referenceChunksIndexPath,
  referenceCollectionDirectoryNames,
  referenceIndexPath,
  referenceRootPath,
}
