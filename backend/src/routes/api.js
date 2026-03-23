import { Router } from 'express'
import { readChronicle } from '../services/chronicleService.js'
import {
  AdventureBuilderError,
  buildAdventureFromNarrative,
} from '../services/adventureBuilderService.js'
import {
  generateNarrative,
  GenerationError,
} from '../services/generationService.js'
import { readSettings, writeSettings } from '../services/settingsService.js'
import {
  ChapterServiceError,
  createChapter,
  createScene,
  listChapters,
  updateScene,
} from '../services/chaptersService.js'
import {
  createWorldBibleEntry,
  listWorldBibleEntries,
  WorldBibleError,
} from '../services/worldBibleService.js'
import {
  readReferenceMarkdown,
  ReferenceLibraryError,
  referenceCollectionDirectoryNames,
  searchReferenceSources,
} from '../services/referenceLibraryService.js'
import {
  getReferenceChunkById,
  getReferenceDocumentById,
  ReferenceSearchError,
  searchReferences,
} from '../services/referenceSearchService.js'

const router = Router()

function parseReferenceLimit(value) {
  if (typeof value === 'undefined') {
    return 25
  }

  const parsed = Number(value)

  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 100) {
    throw new ReferenceLibraryError('Reference search limit must be 1-100.')
  }

  return parsed
}

router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    app: 'mythic-chronicle-backend',
    localOnly: true,
    timestamp: new Date().toISOString(),
    port: Number(process.env.PORT) || 3001,
  })
})

router.get('/references', async (req, res, next) => {
  try {
    const query =
      typeof req.query.query === 'string' ? req.query.query.trim() : ''
    const category =
      typeof req.query.category === 'string' ? req.query.category.trim() : ''
    const limit = parseReferenceLimit(req.query.limit)
    const items = await searchReferenceSources({
      query,
      category,
      limit,
    })

    res.json({
      items,
      query,
      category: category || null,
      categories: referenceCollectionDirectoryNames,
      limit,
      localOnly: true,
    })
  } catch (error) {
    if (error instanceof ReferenceLibraryError) {
      res.status(error.statusCode).json({
        message: error.message,
      })

      return
    }

    next(error)
  }
})

router.get('/references/content', async (req, res, next) => {
  const referencePath = typeof req.query.path === 'string' ? req.query.path : ''

  if (!referencePath.trim()) {
    res.status(400).json({
      message: 'Reference path is required.',
    })

    return
  }

  try {
    const reference = await readReferenceMarkdown(referencePath)

    res.json(reference)
  } catch (error) {
    if (error instanceof ReferenceLibraryError) {
      res.status(error.statusCode).json({
        message: error.message,
      })

      return
    }

    next(error)
  }
})

router.get('/reference/search', async (req, res, next) => {
  try {
    const results = await searchReferences({
      query: typeof req.query.q === 'string' ? req.query.q : '',
      sourceType:
        typeof req.query.sourceType === 'string' ? req.query.sourceType : '',
      sourceName:
        typeof req.query.sourceName === 'string' ? req.query.sourceName : '',
      limit: req.query.limit,
    })

    res.json({
      ...results,
      localOnly: true,
    })
  } catch (error) {
    if (error instanceof ReferenceSearchError) {
      res.status(error.statusCode).json({
        message: error.message,
      })

      return
    }

    next(error)
  }
})

router.get('/reference/document/:id', async (req, res, next) => {
  try {
    const document = await getReferenceDocumentById(req.params.id)

    res.json(document)
  } catch (error) {
    if (error instanceof ReferenceSearchError) {
      res.status(error.statusCode).json({
        message: error.message,
      })

      return
    }

    next(error)
  }
})

router.get('/reference/chunk/:chunkId', async (req, res, next) => {
  try {
    const chunk = await getReferenceChunkById(req.params.chunkId)

    res.json(chunk)
  } catch (error) {
    if (error instanceof ReferenceSearchError) {
      res.status(error.statusCode).json({
        message: error.message,
      })

      return
    }

    next(error)
  }
})

router.get('/chronicle', async (_req, res, next) => {
  try {
    const chronicle = await readChronicle()

    res.json(chronicle)
  } catch (error) {
    next(error)
  }
})

router.get('/settings', async (_req, res, next) => {
  try {
    const settings = await readSettings()

    res.json(settings)
  } catch (error) {
    next(error)
  }
})

router.put('/settings', async (req, res, next) => {
  if (typeof req.body !== 'object' || req.body === null || Array.isArray(req.body)) {
    res.status(400).json({
      message: 'Settings payload must be a JSON object.',
    })

    return
  }

  try {
    const settings = await writeSettings(req.body)

    res.json(settings)
  } catch (error) {
    next(error)
  }
})

router.post('/generate', async (req, res, next) => {
  try {
    const generation = await generateNarrative(req.body)

    res.json(generation)
  } catch (error) {
    if (error instanceof GenerationError || typeof error?.statusCode === 'number') {
      res.status(error.statusCode).json({
        message: error.message,
      })

      return
    }

    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      res.status(504).json({
        message: 'The provider request timed out before text was returned.',
      })

      return
    }

    next(error)
  }
})

router.post('/adventure-builder/transform', async (req, res, next) => {
  try {
    const adventure = await buildAdventureFromNarrative(req.body)

    res.json(adventure)
  } catch (error) {
    if (
      error instanceof AdventureBuilderError ||
      typeof error?.statusCode === 'number'
    ) {
      res.status(error.statusCode).json({
        message: error.message,
      })

      return
    }

    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      res.status(504).json({
        message: 'The provider request timed out before adventure content was returned.',
      })

      return
    }

    next(error)
  }
})

router.get('/world-bible/entries', async (_req, res, next) => {
  try {
    const entries = await listWorldBibleEntries()

    res.json(entries)
  } catch (error) {
    next(error)
  }
})

router.post('/world-bible/entries', async (req, res, next) => {
  try {
    const entry = await createWorldBibleEntry(req.body)

    res.status(201).json(entry)
  } catch (error) {
    if (error instanceof WorldBibleError) {
      res.status(error.statusCode).json({
        message: error.message,
      })

      return
    }

    next(error)
  }
})

router.get('/chapters', async (_req, res, next) => {
  try {
    const chapters = await listChapters()

    res.json(chapters)
  } catch (error) {
    next(error)
  }
})

router.post('/chapters', async (req, res, next) => {
  try {
    const chapter = await createChapter(req.body)

    res.status(201).json(chapter)
  } catch (error) {
    if (error instanceof ChapterServiceError) {
      res.status(error.statusCode).json({
        message: error.message,
      })

      return
    }

    next(error)
  }
})

router.post('/chapters/:chapterId/scenes', async (req, res, next) => {
  try {
    const scene = await createScene(req.params.chapterId, req.body)

    res.status(201).json(scene)
  } catch (error) {
    if (error instanceof ChapterServiceError) {
      res.status(error.statusCode).json({
        message: error.message,
      })

      return
    }

    next(error)
  }
})

router.put('/chapters/:chapterId/scenes/:sceneId', async (req, res, next) => {
  try {
    const scene = await updateScene(
      req.params.chapterId,
      req.params.sceneId,
      req.body,
    )

    res.json(scene)
  } catch (error) {
    if (error instanceof ChapterServiceError) {
      res.status(error.statusCode).json({
        message: error.message,
      })

      return
    }

    next(error)
  }
})

export default router
