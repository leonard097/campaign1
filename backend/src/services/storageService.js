import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const dataDirectoryPath = path.resolve(__dirname, '../../../data')

const collectionDirectoryNames = [
  'characters',
  'locations',
  'factions',
  'items',
  'gods',
  'chapters',
  'adventures',
  'sessions',
  'lore',
]

const defaultSettings = {
  provider: 'OpenAI',
  model: '',
  openaiApiKey: '',
  geminiApiKey: '',
}

const defaultTimeline = {
  eras: [],
  events: [],
}

const defaultStructuredFiles = {
  'settings.json': defaultSettings,
  'timeline.json': defaultTimeline,
}

class StorageError extends Error {
  constructor(message, statusCode = 400) {
    super(message)
    this.name = 'StorageError'
    this.statusCode = statusCode
  }
}

function normalizeDirectoryPath(relativeDirectory = '.') {
  if (typeof relativeDirectory !== 'string') {
    throw new StorageError('Storage directory must be a string.')
  }

  const sanitized = relativeDirectory.replaceAll('\\', '/').trim() || '.'
  const normalized = path.posix.normalize(sanitized)

  if (
    path.posix.isAbsolute(normalized) ||
    /^[A-Za-z]:\//.test(sanitized) ||
    normalized.startsWith('../') ||
    normalized === '..' ||
    normalized.includes('/../')
  ) {
    throw new StorageError('Storage directory must remain inside /data.')
  }

  return normalized
}

function normalizeFilePath(relativePath) {
  if (typeof relativePath !== 'string') {
    throw new StorageError('Storage path must be a string.')
  }

  const sanitized = relativePath.replaceAll('\\', '/').trim()
  const normalized = path.posix.normalize(sanitized)

  if (!normalized || normalized === '.') {
    throw new StorageError('Storage path must point to a file inside /data.')
  }

  if (
    path.posix.isAbsolute(normalized) ||
    /^[A-Za-z]:\//.test(sanitized) ||
    normalized.startsWith('../') ||
    normalized === '..' ||
    normalized.includes('/../')
  ) {
    throw new StorageError('Storage path must remain inside /data.')
  }

  return normalized
}

function toFilesystemPath(relativePath) {
  const normalized = normalizeFilePath(relativePath)

  return path.resolve(dataDirectoryPath, normalized)
}

function detectFormat(relativePath) {
  const extension = path.extname(relativePath).toLowerCase()

  if (extension === '.json') {
    return 'json'
  }

  if (extension === '.md') {
    return 'markdown'
  }

  throw new StorageError(
    'Only .md and .json files are supported by the local storage helpers.',
  )
}

function serializeFile(relativePath, content) {
  const format = detectFormat(relativePath)

  if (format === 'markdown') {
    if (typeof content !== 'string') {
      throw new StorageError('Markdown files must be saved with string content.')
    }

    return content.endsWith('\n') ? content : `${content}\n`
  }

  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content)

      return `${JSON.stringify(parsed, null, 2)}\n`
    } catch {
      throw new StorageError('JSON files must contain valid JSON content.')
    }
  }

  return `${JSON.stringify(content, null, 2)}\n`
}

function parseFile(relativePath, raw) {
  const format = detectFormat(relativePath)

  if (format === 'markdown') {
    return raw
  }

  return JSON.parse(raw)
}

async function createFileIfMissing(relativePath, content) {
  const filePath = toFilesystemPath(relativePath)

  try {
    await fs.access(filePath)
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error
    }

    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, serializeFile(relativePath, content), 'utf8')
  }
}

export async function ensureStorageStructure() {
  await fs.mkdir(dataDirectoryPath, { recursive: true })

  await Promise.all(
    collectionDirectoryNames.map((directoryName) =>
      fs.mkdir(path.join(dataDirectoryPath, directoryName), { recursive: true }),
    ),
  )

  await Promise.all(
    Object.entries(defaultStructuredFiles).map(([relativePath, content]) =>
      createFileIfMissing(relativePath, content),
    ),
  )
}

export async function saveFile(relativePath, content) {
  await ensureStorageStructure()

  const filePath = toFilesystemPath(relativePath)
  const serialized = serializeFile(relativePath, content)

  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, serialized, 'utf8')

  const stats = await fs.stat(filePath)

  return {
    name: path.basename(filePath),
    path: normalizeFilePath(relativePath),
    format: detectFormat(relativePath),
    size: stats.size,
    updatedAt: stats.mtime.toISOString(),
  }
}

export async function readFile(relativePath) {
  await ensureStorageStructure()

  const filePath = toFilesystemPath(relativePath)
  const raw = await fs.readFile(filePath, 'utf8')

  return parseFile(relativePath, raw)
}

export async function listFiles(relativeDirectory = '.') {
  await ensureStorageStructure()

  const normalizedDirectory = normalizeDirectoryPath(relativeDirectory)
  const directoryPath = path.resolve(dataDirectoryPath, normalizedDirectory)
  const entries = await fs.readdir(directoryPath, { withFileTypes: true })

  const listing = await Promise.all(
    entries
      .filter((entry) => !entry.name.startsWith('.'))
      .map(async (entry) => {
        const relativePath =
          normalizedDirectory === '.'
            ? entry.name
            : path.posix.join(normalizedDirectory, entry.name)
        const fullPath = path.resolve(directoryPath, entry.name)
        const stats = await fs.stat(fullPath)
        const isFile = entry.isFile()

        return {
          name: entry.name,
          path: relativePath,
          type: isFile ? 'file' : 'directory',
          format: isFile ? detectFormat(relativePath) : null,
          size: isFile ? stats.size : null,
          updatedAt: stats.mtime.toISOString(),
        }
      }),
  )

  return listing.sort((left, right) => {
    if (left.type !== right.type) {
      return left.type === 'directory' ? -1 : 1
    }

    return left.name.localeCompare(right.name)
  })
}

export {
  StorageError,
  collectionDirectoryNames,
  dataDirectoryPath,
  defaultSettings,
  defaultStructuredFiles,
  defaultTimeline,
}
