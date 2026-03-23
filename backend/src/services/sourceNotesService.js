import path from 'node:path'
import { listFiles, saveFile } from './storageService.js'

const sourceNotesDirectory = 'source-notes'

class SourceNotesError extends Error {
  constructor(message, statusCode = 400) {
    super(message)
    this.name = 'SourceNotesError'
    this.statusCode = statusCode
  }
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function normalizeRequiredString(value, fieldName) {
  if (typeof value !== 'string') {
    throw new SourceNotesError(`"${fieldName}" must be a string.`)
  }

  return value.trim()
}

function normalizeOptionalString(value, fieldName) {
  if (typeof value === 'undefined' || value === null) {
    return ''
  }

  if (typeof value !== 'string') {
    throw new SourceNotesError(`"${fieldName}" must be a string.`)
  }

  return value.trim()
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean),
    ),
  )
}

function createExcerpt(content) {
  const normalized = content.replace(/\s+/g, ' ').trim()

  if (!normalized) {
    return ''
  }

  if (normalized.length <= 180) {
    return normalized
  }

  return `${normalized.slice(0, 177).trimEnd()}...`
}

function serializeSourceNote(note) {
  const metadata = {
    id: note.id,
    title: note.title,
    sourceType: note.sourceType,
    sourceName: note.sourceName,
    referenceDocumentId: note.referenceDocumentId,
    referenceChunkId: note.referenceChunkId,
    headingPath: note.headingPath,
    tags: note.tags,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  }

  return `---\n${JSON.stringify(metadata, null, 2)}\n---\n${note.content.trim()}\n`
}

async function buildUniqueSourceNoteId(title) {
  const entries = await listFiles(sourceNotesDirectory)
  const usedIds = new Set(
    entries
      .filter((entry) => entry.type === 'file' && entry.format === 'markdown')
      .map((entry) => path.posix.basename(entry.path, path.posix.extname(entry.path))),
  )
  const baseSlug = slugify(title)

  if (!baseSlug) {
    throw new SourceNotesError('Source note title must contain letters or numbers.')
  }

  let index = 1
  let candidate = `source-note-${baseSlug}`

  while (usedIds.has(candidate)) {
    index += 1
    candidate = `source-note-${baseSlug}-${index}`
  }

  return candidate
}

function validateCreatePayload(payload) {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new SourceNotesError('Source note payload must be a JSON object.')
  }

  const title = normalizeRequiredString(payload.title, 'title')
  const content = normalizeRequiredString(payload.content, 'content')
  const sourceType = normalizeOptionalString(payload.sourceType, 'sourceType')
  const sourceName = normalizeOptionalString(payload.sourceName, 'sourceName')
  const referenceDocumentId = normalizeOptionalString(
    payload.referenceDocumentId,
    'referenceDocumentId',
  )
  const referenceChunkId = normalizeOptionalString(
    payload.referenceChunkId,
    'referenceChunkId',
  )
  const headingPath = normalizeStringArray(payload.headingPath)
  const tags = normalizeStringArray(payload.tags)

  if (!title) {
    throw new SourceNotesError('Add a title before saving the source note.')
  }

  if (!content) {
    throw new SourceNotesError('Add content before saving the source note.')
  }

  return {
    title,
    content,
    sourceType,
    sourceName,
    referenceDocumentId,
    referenceChunkId,
    headingPath,
    tags,
  }
}

export async function createSourceNote(payload) {
  const sourceNote = validateCreatePayload(payload)
  const sourceNoteId = await buildUniqueSourceNoteId(sourceNote.title)
  const timestamp = new Date().toISOString()
  const relativePath = `${sourceNotesDirectory}/${sourceNoteId}.md`

  await saveFile(
    relativePath,
    serializeSourceNote({
      ...sourceNote,
      id: sourceNoteId,
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
  )

  return {
    id: sourceNoteId,
    title: sourceNote.title,
    sourceType: sourceNote.sourceType,
    sourceName: sourceNote.sourceName,
    referenceDocumentId: sourceNote.referenceDocumentId,
    referenceChunkId: sourceNote.referenceChunkId,
    headingPath: sourceNote.headingPath,
    tags: sourceNote.tags,
    path: relativePath,
    createdAt: timestamp,
    updatedAt: timestamp,
    excerpt: createExcerpt(sourceNote.content),
  }
}

export { SourceNotesError }
