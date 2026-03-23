import path from 'node:path'
import { listFiles, readFile, saveFile } from './storageService.js'
import { listWorldBibleEntries } from './worldBibleService.js'

const chaptersDirectory = 'chapters'
const chapterMetadataFileName = 'chapter.json'
const defaultScenePov = 'Third Person Limited'

const scenePovOptions = [
  'Third Person Limited',
  'Third Person Omniscient',
  'Character-focused',
]

class ChapterServiceError extends Error {
  constructor(message, statusCode = 400) {
    super(message)
    this.name = 'ChapterServiceError'
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

function humanizeSlug(value) {
  return value
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function normalizeRequiredString(value, fieldName) {
  if (typeof value !== 'string') {
    throw new ChapterServiceError(`"${fieldName}" must be a string.`)
  }

  return value.trim()
}

function normalizeOptionalString(value, fieldName) {
  if (typeof value === 'undefined' || value === null) {
    return ''
  }

  if (typeof value !== 'string') {
    throw new ChapterServiceError(`"${fieldName}" must be a string.`)
  }

  return value.trim()
}

function normalizeIdList(value, fieldName) {
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

function normalizeScenePov(value, { fallback = defaultScenePov, required = false } = {}) {
  if (typeof value === 'undefined' || value === null || value === '') {
    if (required) {
      throw new ChapterServiceError('Select a POV for the scene.')
    }

    return fallback
  }

  const pov = normalizeRequiredString(value, 'pov')

  if (!scenePovOptions.includes(pov)) {
    throw new ChapterServiceError('Select a valid POV for the scene.')
  }

  return pov
}

function createExcerpt(content) {
  const text = content.replace(/\s+/g, ' ').trim()

  if (!text) {
    return ''
  }

  if (text.length <= 180) {
    return text
  }

  return `${text.slice(0, 177).trimEnd()}...`
}

function chapterMetadataPath(chapterId) {
  return path.posix.join(chaptersDirectory, chapterId, chapterMetadataFileName)
}

function sceneMarkdownPath(chapterId, sceneId) {
  return path.posix.join(chaptersDirectory, chapterId, `${sceneId}.md`)
}

function normalizeChapterRecord(chapterId, value, fallbackUpdatedAt) {
  const input =
    typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {}
  const title =
    typeof input.title === 'string' && input.title.trim()
      ? input.title.trim()
      : humanizeSlug(chapterId)

  return {
    id: chapterId,
    title,
    sceneOrder: normalizeIdList(input.sceneOrder, 'sceneOrder'),
    createdAt:
      typeof input.createdAt === 'string' && input.createdAt.trim()
        ? input.createdAt.trim()
        : fallbackUpdatedAt,
    updatedAt:
      typeof input.updatedAt === 'string' && input.updatedAt.trim()
        ? input.updatedAt.trim()
        : fallbackUpdatedAt,
  }
}

function serializeSceneMarkdown(scene) {
  const metadata = {
    id: scene.id,
    title: scene.title,
    pov: scene.pov,
    linkedCharacterIds: scene.linkedCharacterIds,
    linkedLocationIds: scene.linkedLocationIds,
    createdAt: scene.createdAt,
    updatedAt: scene.updatedAt,
  }

  return `---\n${JSON.stringify(metadata, null, 2)}\n---\n${scene.content.trim()}\n`
}

function parseSceneMarkdown(relativePath, markdown, updatedAt, chapterId) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/u)
  const fallbackId = path.posix.basename(relativePath, path.posix.extname(relativePath))

  if (!match) {
    return {
      id: fallbackId,
      chapterId,
      title: humanizeSlug(fallbackId),
      content: markdown.trim(),
      pov: defaultScenePov,
      linkedCharacterIds: [],
      linkedLocationIds: [],
      createdAt: updatedAt,
      updatedAt,
      path: relativePath,
      excerpt: createExcerpt(markdown),
    }
  }

  let metadata = {}

  try {
    metadata = JSON.parse(match[1])
  } catch {
    metadata = {}
  }

  const content = match[2].trim()

  return {
    id:
      typeof metadata.id === 'string' && metadata.id.trim()
        ? metadata.id.trim()
        : fallbackId,
    chapterId,
    title:
      typeof metadata.title === 'string' && metadata.title.trim()
        ? metadata.title.trim()
        : humanizeSlug(fallbackId),
    content,
    pov: normalizeScenePov(metadata.pov, { fallback: defaultScenePov }),
    linkedCharacterIds: normalizeIdList(
      metadata.linkedCharacterIds,
      'linkedCharacterIds',
    ),
    linkedLocationIds: normalizeIdList(
      metadata.linkedLocationIds,
      'linkedLocationIds',
    ),
    createdAt:
      typeof metadata.createdAt === 'string' && metadata.createdAt.trim()
        ? metadata.createdAt.trim()
        : updatedAt,
    updatedAt:
      typeof metadata.updatedAt === 'string' && metadata.updatedAt.trim()
        ? metadata.updatedAt.trim()
        : updatedAt,
    path: relativePath,
    excerpt: createExcerpt(content),
  }
}

async function buildUniqueChapterId(title) {
  const entries = await listFiles(chaptersDirectory)
  const usedIds = new Set(
    entries
      .filter((entry) => entry.type === 'directory')
      .map((entry) => path.posix.basename(entry.path)),
  )
  const baseSlug = slugify(title)

  if (!baseSlug) {
    throw new ChapterServiceError('Chapter title must contain letters or numbers.')
  }

  let index = 1
  let candidate = `chapter-${baseSlug}`

  while (usedIds.has(candidate)) {
    index += 1
    candidate = `chapter-${baseSlug}-${index}`
  }

  return candidate
}

async function buildUniqueSceneId(chapterId, title) {
  const entries = await listFiles(path.posix.join(chaptersDirectory, chapterId))
  const usedIds = new Set(
    entries
      .filter((entry) => entry.type === 'file' && entry.format === 'markdown')
      .map((entry) => path.posix.basename(entry.path, path.posix.extname(entry.path))),
  )
  const baseSlug = slugify(title)

  if (!baseSlug) {
    throw new ChapterServiceError('Scene title must contain letters or numbers.')
  }

  let index = 1
  let candidate = `scene-${baseSlug}`

  while (usedIds.has(candidate)) {
    index += 1
    candidate = `scene-${baseSlug}-${index}`
  }

  return candidate
}

async function readChapterMetadata(chapterId) {
  const chapterPath = chapterMetadataPath(chapterId)

  try {
    const chapter = await readFile(chapterPath)

    return normalizeChapterRecord(chapterId, chapter, new Date().toISOString())
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new ChapterServiceError('Chapter not found.', 404)
    }

    throw error
  }
}

async function saveChapterMetadata(chapter) {
  await saveFile(chapterMetadataPath(chapter.id), chapter)
}

async function readScene(chapterId, sceneId) {
  const scenePath = sceneMarkdownPath(chapterId, sceneId)
  const entries = await listFiles(path.posix.join(chaptersDirectory, chapterId))
  const sceneFile = entries.find((entry) => entry.path === scenePath)

  if (!sceneFile) {
    throw new ChapterServiceError('Scene not found.', 404)
  }

  const markdown = await readFile(scenePath)

  return parseSceneMarkdown(
    scenePath,
    markdown,
    sceneFile.updatedAt ?? new Date().toISOString(),
    chapterId,
  )
}

async function readChapterScenes(chapterId, sceneOrder) {
  const entries = await listFiles(path.posix.join(chaptersDirectory, chapterId))
  const scenes = []

  for (const entry of entries) {
    if (entry.type !== 'file' || entry.format !== 'markdown') {
      continue
    }

    const markdown = await readFile(entry.path)

    scenes.push(
      parseSceneMarkdown(
        entry.path,
        markdown,
        entry.updatedAt ?? new Date().toISOString(),
        chapterId,
      ),
    )
  }

  const sceneMap = new Map(scenes.map((scene) => [scene.id, scene]))
  const orderedIds = [
    ...sceneOrder.filter((sceneId) => sceneMap.has(sceneId)),
    ...scenes
      .map((scene) => scene.id)
      .filter((sceneId) => !sceneOrder.includes(sceneId))
      .sort((left, right) => {
        const leftScene = sceneMap.get(left)
        const rightScene = sceneMap.get(right)

        return leftScene.title.localeCompare(rightScene.title)
      }),
  ]

  return orderedIds.map((sceneId) => sceneMap.get(sceneId))
}

async function readChapter(chapterId) {
  const chapter = await readChapterMetadata(chapterId)
  const scenes = await readChapterScenes(chapterId, chapter.sceneOrder)

  return {
    ...chapter,
    scenes,
    sceneCount: scenes.length,
  }
}

async function validateSceneLinks(linkedCharacterIds, linkedLocationIds) {
  const worldBibleEntries = await listWorldBibleEntries()
  const characterIds = new Set(
    worldBibleEntries
      .filter((entry) => entry.type === 'NPC')
      .map((entry) => entry.id),
  )
  const locationIds = new Set(
    worldBibleEntries
      .filter((entry) => entry.type === 'Location')
      .map((entry) => entry.id),
  )
  const invalidCharacterIds = linkedCharacterIds.filter((entryId) => !characterIds.has(entryId))
  const invalidLocationIds = linkedLocationIds.filter((entryId) => !locationIds.has(entryId))

  if (invalidCharacterIds.length) {
    throw new ChapterServiceError(
      'One or more linked characters do not exist in the World Bible.',
    )
  }

  if (invalidLocationIds.length) {
    throw new ChapterServiceError(
      'One or more linked locations do not exist in the World Bible.',
    )
  }
}

function validateChapterPayload(payload) {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new ChapterServiceError('Chapter payload must be a JSON object.')
  }

  const title = normalizeRequiredString(payload.title, 'title')

  if (!title) {
    throw new ChapterServiceError('Add a chapter title before saving.')
  }

  return { title }
}

function validateScenePayload(payload, options = {}) {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new ChapterServiceError('Scene payload must be a JSON object.')
  }

  const title = options.allowPartial && typeof payload.title === 'undefined'
    ? options.existingScene.title
    : normalizeRequiredString(payload.title, 'title')
  const content = options.allowPartial && typeof payload.content === 'undefined'
    ? options.existingScene.content
    : normalizeOptionalString(payload.content, 'content')
  const pov =
    options.allowPartial && typeof payload.pov === 'undefined'
      ? options.existingScene.pov
      : normalizeScenePov(payload.pov, {
          fallback: options.existingScene?.pov ?? defaultScenePov,
          required: !options.allowPartial,
        })
  const linkedCharacterIds =
    options.allowPartial && typeof payload.linkedCharacterIds === 'undefined'
      ? options.existingScene.linkedCharacterIds
      : normalizeIdList(payload.linkedCharacterIds, 'linkedCharacterIds')
  const linkedLocationIds =
    options.allowPartial && typeof payload.linkedLocationIds === 'undefined'
      ? options.existingScene.linkedLocationIds
      : normalizeIdList(payload.linkedLocationIds, 'linkedLocationIds')

  if (!title) {
    throw new ChapterServiceError('Add a scene title before saving.')
  }

  return {
    title,
    content,
    pov,
    linkedCharacterIds,
    linkedLocationIds,
  }
}

export async function listChapters() {
  const entries = await listFiles(chaptersDirectory)
  const chapterIds = entries
    .filter((entry) => entry.type === 'directory')
    .map((entry) => path.posix.basename(entry.path))
  const chapters = await Promise.all(chapterIds.map((chapterId) => readChapter(chapterId)))

  return chapters.sort((left, right) => {
    if (left.createdAt !== right.createdAt) {
      return left.createdAt.localeCompare(right.createdAt)
    }

    return left.title.localeCompare(right.title)
  })
}

export async function createChapter(payload) {
  const chapter = validateChapterPayload(payload)
  const chapterId = await buildUniqueChapterId(chapter.title)
  const timestamp = new Date().toISOString()

  await saveChapterMetadata({
    id: chapterId,
    title: chapter.title,
    sceneOrder: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  })

  return readChapter(chapterId)
}

export async function createScene(chapterId, payload) {
  const normalizedChapterId = normalizeRequiredString(chapterId, 'chapterId')
  const chapter = await readChapterMetadata(normalizedChapterId)
  const scene = validateScenePayload(payload)

  await validateSceneLinks(scene.linkedCharacterIds, scene.linkedLocationIds)

  const sceneId = await buildUniqueSceneId(normalizedChapterId, scene.title)
  const timestamp = new Date().toISOString()

  await saveFile(
    sceneMarkdownPath(normalizedChapterId, sceneId),
    serializeSceneMarkdown({
      id: sceneId,
      title: scene.title,
      content: scene.content,
      pov: scene.pov,
      linkedCharacterIds: scene.linkedCharacterIds,
      linkedLocationIds: scene.linkedLocationIds,
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
  )

  await saveChapterMetadata({
    ...chapter,
    sceneOrder: [...chapter.sceneOrder, sceneId],
    updatedAt: timestamp,
  })

  return readScene(normalizedChapterId, sceneId)
}

export async function updateScene(chapterId, sceneId, payload) {
  const normalizedChapterId = normalizeRequiredString(chapterId, 'chapterId')
  const normalizedSceneId = normalizeRequiredString(sceneId, 'sceneId')
  const chapter = await readChapterMetadata(normalizedChapterId)
  const existingScene = await readScene(normalizedChapterId, normalizedSceneId)
  const scene = validateScenePayload(payload, {
    allowPartial: true,
    existingScene,
  })
  const timestamp = new Date().toISOString()

  await validateSceneLinks(scene.linkedCharacterIds, scene.linkedLocationIds)

  await saveFile(
    sceneMarkdownPath(normalizedChapterId, normalizedSceneId),
    serializeSceneMarkdown({
      ...existingScene,
      ...scene,
      updatedAt: timestamp,
    }),
  )

  await saveChapterMetadata({
    ...chapter,
    sceneOrder: chapter.sceneOrder.includes(normalizedSceneId)
      ? chapter.sceneOrder
      : [...chapter.sceneOrder, normalizedSceneId],
    updatedAt: timestamp,
  })

  return readScene(normalizedChapterId, normalizedSceneId)
}

export { ChapterServiceError, defaultScenePov, scenePovOptions }
