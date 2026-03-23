import path from 'node:path'
import { readChronicle } from './chronicleService.js'
import { listFiles, readFile } from './storageService.js'

const characterCollections = ['characters']
const locationCollections = ['locations']
const loreCollections = ['lore', 'factions', 'items', 'gods']
const sceneCollections = ['chapters', 'sessions', 'adventures']

function tokenize(text = '') {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .match(/[a-z0-9']+/g)
        ?.filter((token) => token.length >= 3) ?? [],
    ),
  )
}

function humanizeFileName(filePath) {
  return path
    .basename(filePath, path.extname(filePath))
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function limitText(text, maxLength = 220) {
  const cleaned = text.replace(/\s+/g, ' ').trim()

  if (cleaned.length <= maxLength) {
    return cleaned
  }

  return `${cleaned.slice(0, maxLength - 1).trimEnd()}...`
}

function summarizeMarkdown(markdown) {
  const withoutFrontmatter = markdown.replace(/^---[\s\S]*?---\s*/u, '')
  const lines = withoutFrontmatter
    .split(/\r?\n/u)
    .map((line) =>
      line
        .replace(/^#{1,6}\s*/u, '')
        .replace(/^[-*+]\s*/u, '')
        .replace(/`/gu, '')
        .trim(),
    )
    .filter(Boolean)

  return limitText(lines.slice(0, 3).join(' '), 240)
}

function scoreEntry(fileEntry, summary, context) {
  const name = humanizeFileName(fileEntry.path).toLowerCase()
  const haystack = `${name} ${summary}`.toLowerCase()
  let score = 0

  for (const characterName of context.mentionedCharacterNames) {
    if (haystack.includes(characterName)) {
      score += 10
    }
  }

  for (const token of context.promptTokens) {
    if (haystack.includes(token)) {
      score += fileEntry.directory === 'locations' ? 4 : 2
    }
  }

  for (const token of context.plotTokens) {
    if (haystack.includes(token)) {
      score += 1
    }
  }

  return score
}

async function loadRankedMarkdownEntries(collections, context) {
  const rankedEntries = []

  for (const collection of collections) {
    const files = await listFiles(collection)

    for (const file of files) {
      if (file.type !== 'file' || file.format !== 'markdown') {
        continue
      }

      const markdown = await readFile(file.path)
      const summary = summarizeMarkdown(markdown)
      const score = scoreEntry({ ...file, directory: collection }, summary, context)

      rankedEntries.push({
        collection,
        name: humanizeFileName(file.path),
        path: file.path,
        summary,
        score,
        updatedAt: file.updatedAt,
      })
    }
  }

  return rankedEntries.sort((left, right) => {
    if (left.score !== right.score) {
      return right.score - left.score
    }

    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
  })
}

async function loadCurrentSceneContext() {
  const sceneCandidates = []

  for (const collection of sceneCollections) {
    const files = await listFiles(collection)

    for (const file of files) {
      if (file.type !== 'file' || file.format !== 'markdown') {
        continue
      }

      const name = file.name.toLowerCase()
      const priority = /(current|active|scene|latest)/u.test(name) ? 1 : 0

      sceneCandidates.push({
        ...file,
        collection,
        priority,
      })
    }
  }

  sceneCandidates.sort((left, right) => {
    if (left.priority !== right.priority) {
      return right.priority - left.priority
    }

    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
  })

  const selectedScene = sceneCandidates[0]

  if (!selectedScene) {
    return ''
  }

  const markdown = await readFile(selectedScene.path)
  const summary = summarizeMarkdown(markdown)

  return `Current scene: ${selectedScene.collection}/${humanizeFileName(selectedScene.path)} - ${summary}`
}

function buildCharacterLine(characterEntries, chronicle, context) {
  const matchedEntries = characterEntries
    .filter((entry) => entry.score > 0)
    .slice(0, 2)
    .map((entry) => `${entry.name} - ${entry.summary}`)

  if (matchedEntries.length) {
    return `Characters: ${matchedEntries.join(' | ')}`
  }

  const partyMatches =
    chronicle?.currentCampaign?.party
      ?.filter((member) =>
        context.mentionedCharacterNames.some((name) =>
          member.name.toLowerCase().includes(name),
        ),
      )
      .slice(0, 2)
      .map((member) => `${member.name} - ${member.role}`) ?? []

  return partyMatches.length ? `Characters: ${partyMatches.join(' | ')}` : ''
}

function buildLocationLine(locationEntries) {
  const location = locationEntries.find((entry) => entry.score > 0)

  return location ? `Location: ${location.name} - ${location.summary}` : ''
}

function buildLoreLine(loreEntries) {
  const relevantLore = loreEntries
    .filter((entry) => entry.score > 0)
    .slice(0, 2)
    .map((entry) => `${entry.name} - ${entry.summary}`)

  return relevantLore.length ? `Relevant lore: ${relevantLore.join(' | ')}` : ''
}

function buildActiveThreadsLine(chronicle, context) {
  const lines = []
  const currentObjective = chronicle?.currentCampaign?.currentObjective

  if (currentObjective) {
    lines.push(`Objective: ${limitText(currentObjective, 180)}`)
  }

  const matchingGoals =
    chronicle?.storyGoals
      ?.filter((goal) =>
        context.promptTokens.some((token) => goal.toLowerCase().includes(token)),
      )
      .slice(0, 1)
      .map((goal) => `Thread: ${limitText(goal, 160)}`) ?? []

  lines.push(...matchingGoals)

  return lines.length ? `Active plot threads: ${lines.join(' | ')}` : ''
}

function formatTimelineEntry(event) {
  if (typeof event === 'string') {
    return limitText(event, 120)
  }

  if (typeof event !== 'object' || event === null) {
    return ''
  }

  const date = typeof event.date === 'string' ? event.date.trim() : ''
  const title = typeof event.title === 'string' ? event.title.trim() : ''
  const summarySource =
    typeof event.summary === 'string'
      ? event.summary
      : typeof event.description === 'string'
        ? event.description
        : typeof event.details === 'string'
          ? event.details
          : ''
  const summary = summarySource.trim()
  const parts = [date, title, limitText(summary, 120)].filter(Boolean)

  return parts.join(' - ')
}

function buildTimelineLine(timeline) {
  const events = Array.isArray(timeline)
    ? timeline
    : Array.isArray(timeline?.events)
      ? timeline.events
      : []

  const recentEvents = events
    .slice(-3)
    .map(formatTimelineEntry)
    .filter(Boolean)

  return recentEvents.length
    ? `Recent timeline: ${recentEvents.join(' | ')}`
    : ''
}

export async function buildWorldContext(request) {
  const chronicle = await readChronicle().catch(() => null)
  const timeline = await readFile('timeline.json').catch(() => null)
  const promptTokens = tokenize(request.userInput)
  const plotTokens = tokenize(
    [
      chronicle?.currentCampaign?.currentObjective ?? '',
      ...(chronicle?.storyGoals ?? []),
    ].join(' '),
  )
  const mentionedCharacterNames =
    chronicle?.currentCampaign?.party
      ?.map((member) => member.name.toLowerCase())
      .filter(
        (name) =>
          request.userInput.toLowerCase().includes(name) ||
          name.split(/\s+/u).some((part) => promptTokens.includes(part)),
      ) ?? []

  const context = {
    promptTokens,
    plotTokens,
    mentionedCharacterNames,
  }

  const [characterEntries, locationEntries, loreEntries, currentSceneLine] =
    await Promise.all([
      loadRankedMarkdownEntries(characterCollections, context),
      loadRankedMarkdownEntries(locationCollections, context),
      loadRankedMarkdownEntries(loreCollections, context),
      loadCurrentSceneContext(),
    ])

  const worldContextLines = [
    buildCharacterLine(characterEntries, chronicle, context),
    buildLocationLine(locationEntries),
    buildActiveThreadsLine(chronicle, context),
    currentSceneLine,
    buildLoreLine(loreEntries),
    buildTimelineLine(timeline),
  ].filter(Boolean)

  if (!worldContextLines.length) {
    return ''
  }

  return ['World Context:', ...worldContextLines.map((line) => `- ${line}`)].join('\n')
}
