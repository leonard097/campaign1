import path from 'node:path'
import { listFiles, readFile, saveFile } from './storageService.js'

const entryTypeConfig = {
  NPC: {
    directory: 'characters',
    prefix: 'npc',
  },
  Location: {
    directory: 'locations',
    prefix: 'location',
  },
  Faction: {
    directory: 'factions',
    prefix: 'faction',
  },
  Item: {
    directory: 'items',
    prefix: 'item',
  },
  God: {
    directory: 'gods',
    prefix: 'god',
  },
  History: {
    directory: 'lore',
    prefix: 'history',
  },
}

class WorldBibleError extends Error {
  constructor(message, statusCode = 400) {
    super(message)
    this.name = 'WorldBibleError'
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

function normalizeString(value, fieldName) {
  if (typeof value !== 'string') {
    throw new WorldBibleError(`"${fieldName}" must be a string.`)
  }

  return value.trim()
}

function normalizeTags(value) {
  const rawTags = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : []

  return Array.from(
    new Set(
      rawTags
        .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
        .filter(Boolean),
    ),
  )
}

function normalizeLinks(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return Array.from(
    new Set(
      value
        .map((link) => (typeof link === 'string' ? link.trim() : ''))
        .filter(Boolean),
    ),
  )
}

function inferEntryTypeFromDirectory(directory) {
  const entryType = Object.entries(entryTypeConfig).find(
    ([, config]) => config.directory === directory,
  )?.[0]

  if (!entryType) {
    throw new WorldBibleError(`Unsupported World Bible directory "${directory}".`)
  }

  return entryType
}

function serializeWorldBibleEntry(entry) {
  const metadata = {
    id: entry.id,
    type: entry.type,
    title: entry.title,
    tags: entry.tags,
    links: entry.links,
  }

  return `---\n${JSON.stringify(metadata, null, 2)}\n---\n${entry.description.trim()}\n`
}

function parseWorldBibleFile(relativePath, markdown, updatedAt) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/u)
  const directory = relativePath.split('/')[0]
  const fallbackType = inferEntryTypeFromDirectory(directory)
  const fallbackId = path.basename(relativePath, path.extname(relativePath))

  if (!match) {
    return {
      id: fallbackId,
      type: fallbackType,
      title: fallbackId.replace(/[-_]+/g, ' '),
      tags: [],
      links: [],
      description: markdown.trim(),
      path: relativePath,
      updatedAt,
    }
  }

  let metadata = {}

  try {
    metadata = JSON.parse(match[1])
  } catch {
    metadata = {}
  }

  return {
    id:
      typeof metadata.id === 'string' && metadata.id.trim()
        ? metadata.id.trim()
        : fallbackId,
    type:
      typeof metadata.type === 'string' && metadata.type.trim()
        ? metadata.type.trim()
        : fallbackType,
    title:
      typeof metadata.title === 'string' && metadata.title.trim()
        ? metadata.title.trim()
        : fallbackId.replace(/[-_]+/g, ' '),
    tags: normalizeTags(metadata.tags),
    links: normalizeLinks(metadata.links),
    description: match[2].trim(),
    path: relativePath,
    updatedAt,
  }
}

function createExcerpt(description) {
  const text = description.replace(/\s+/g, ' ').trim()

  if (text.length <= 180) {
    return text
  }

  return `${text.slice(0, 177).trimEnd()}...`
}

function validateEntryType(type) {
  if (!Object.hasOwn(entryTypeConfig, type)) {
    throw new WorldBibleError('Select a valid World Bible entry type.')
  }

  return type
}

async function buildUniqueEntryId(type, title) {
  const config = entryTypeConfig[type]
  const baseSlug = slugify(title)

  if (!baseSlug) {
    throw new WorldBibleError('Entry title must contain letters or numbers.')
  }

  const files = await listFiles(config.directory)
  const usedIds = new Set(
    files
      .filter((file) => file.type === 'file' && file.format === 'markdown')
      .map((file) => path.basename(file.path, path.extname(file.path))),
  )

  let index = 1
  let candidate = `${config.prefix}-${baseSlug}`

  while (usedIds.has(candidate)) {
    index += 1
    candidate = `${config.prefix}-${baseSlug}-${index}`
  }

  return candidate
}

function validateCreatePayload(payload) {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new WorldBibleError('World Bible payload must be a JSON object.')
  }

  const type = validateEntryType(normalizeString(payload.type, 'type'))
  const title = normalizeString(payload.title, 'title')
  const description = normalizeString(payload.description, 'description')
  const tags = normalizeTags(payload.tags)
  const links = normalizeLinks(payload.links)

  if (!title) {
    throw new WorldBibleError('Add a title before saving the entry.')
  }

  if (!description) {
    throw new WorldBibleError('Add a markdown description before saving the entry.')
  }

  return {
    type,
    title,
    tags,
    links,
    description,
  }
}

async function readEntriesFromDirectory(directory) {
  const files = await listFiles(directory)
  const entries = []

  for (const file of files) {
    if (file.type !== 'file' || file.format !== 'markdown') {
      continue
    }

    const markdown = await readFile(file.path)
    const parsedEntry = parseWorldBibleFile(file.path, markdown, file.updatedAt)

    entries.push({
      ...parsedEntry,
      excerpt: createExcerpt(parsedEntry.description),
    })
  }

  return entries
}

export async function listWorldBibleEntries() {
  const directories = Object.values(entryTypeConfig).map((config) => config.directory)
  const entryGroups = await Promise.all(
    directories.map((directory) => readEntriesFromDirectory(directory)),
  )

  return entryGroups
    .flat()
    .sort((left, right) => left.title.localeCompare(right.title))
}

export async function createWorldBibleEntry(payload) {
  const entry = validateCreatePayload(payload)
  const existingEntries = await listWorldBibleEntries()
  const validLinkIds = new Set(existingEntries.map((existingEntry) => existingEntry.id))
  const invalidLinks = entry.links.filter((linkId) => !validLinkIds.has(linkId))

  if (invalidLinks.length) {
    throw new WorldBibleError('One or more linked World Bible entries no longer exist.')
  }

  const entryId = await buildUniqueEntryId(entry.type, entry.title)
  const config = entryTypeConfig[entry.type]
  const relativePath = `${config.directory}/${entryId}.md`

  await saveFile(
    relativePath,
    serializeWorldBibleEntry({
      ...entry,
      id: entryId,
    }),
  )

  const markdown = await readFile(relativePath)
  const fileEntries = await listFiles(config.directory)
  const savedFile = fileEntries.find((file) => file.path === relativePath)
  const parsedEntry = parseWorldBibleFile(
    relativePath,
    markdown,
    savedFile?.updatedAt ?? new Date().toISOString(),
  )

  return {
    ...parsedEntry,
    excerpt: createExcerpt(parsedEntry.description),
  }
}

export { entryTypeConfig, WorldBibleError }
