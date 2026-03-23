import { readSettings } from './settingsService.js'
import { generateTextWithProvider } from './providerTextService.js'
import { buildWorldContext } from './worldContextService.js'

const ADVENTURE_BUILDER_PROMPT = `You are a fantasy adventure conversion engine and D&D prep companion.

Transform narrative text into structured tabletop-ready content.

OUTPUT REQUIREMENTS:
- Return valid JSON only.
- Do not wrap the JSON in markdown fences.
- Keep entries concise, playable, and grounded in the source material.
- Prefer strong adventure utility over literary flourish.
- Stay consistent with the narrative and any World Context provided.

JSON SHAPE:
{
  "summary": "short GM-facing overview",
  "questHooks": [
    {
      "title": "hook title",
      "pitch": "what draws the party in",
      "stakes": "why it matters"
    }
  ],
  "encounters": [
    {
      "title": "encounter title",
      "type": "combat | social | exploration | hazard | boss",
      "description": "what the scene is",
      "objective": "what the party may try to accomplish",
      "opposition": "main threat, pressure, or obstacle",
      "complications": "twist, timer, terrain, or consequence"
    }
  ],
  "loot": [
    {
      "name": "reward name",
      "rarity": "mundane | common | uncommon | rare | very rare | legendary",
      "description": "what it does or why it matters"
    }
  ],
  "statBlocks": [
    {
      "name": "creature or NPC name",
      "role": "combat role or narrative role",
      "challengeRating": "approximate CR or difficulty label",
      "armorClass": "AC value",
      "hitPoints": "HP value",
      "speed": "movement",
      "stats": {
        "STR": "score",
        "DEX": "score",
        "CON": "score",
        "INT": "score",
        "WIS": "score",
        "CHA": "score"
      },
      "abilities": ["passive traits or powers"],
      "actions": ["simple action lines"]
    }
  ]
}

CONTENT RULES:
- Create 1-3 quest hooks when possible.
- Create 2-5 encounters when the narrative supports it.
- Create 1-4 loot entries when rewards make sense.
- Create only the stat blocks the GM would likely need immediately.
- If the story does not support a section, return an empty array for that section.
- Do not invent unrelated settings, factions, or monsters.
- Keep stat blocks basic and fast to run, not full rules encyclopedia entries.`

const encounterTypes = new Set([
  'combat',
  'social',
  'exploration',
  'hazard',
  'boss',
])

const lootRarities = new Set([
  'mundane',
  'common',
  'uncommon',
  'rare',
  'very rare',
  'legendary',
])

class AdventureBuilderError extends Error {
  constructor(message, statusCode = 500) {
    super(message)
    this.name = 'AdventureBuilderError'
    this.statusCode = statusCode
  }
}

function ensureString(value, fieldName) {
  if (typeof value !== 'string') {
    throw new AdventureBuilderError(`"${fieldName}" must be a string.`, 400)
  }

  return value.trim()
}

function validateAdventurePayload(payload) {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new AdventureBuilderError(
      'Adventure Builder payload must be a JSON object.',
      400,
    )
  }

  const narrative = ensureString(payload.narrative, 'narrative')

  if (!narrative) {
    throw new AdventureBuilderError(
      'Add narrative text before building an adventure.',
      400,
    )
  }

  return { narrative }
}

function parseString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback
}

function parseStringArray(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
}

function normalizeEncounterType(value) {
  const normalized = parseString(value).toLowerCase()

  return encounterTypes.has(normalized) ? normalized : 'exploration'
}

function normalizeLootRarity(value) {
  const normalized = parseString(value).toLowerCase()

  return lootRarities.has(normalized) ? normalized : 'mundane'
}

function normalizeStats(value) {
  const stats =
    typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {}

  return {
    STR: parseString(stats.STR || stats.str, '-'),
    DEX: parseString(stats.DEX || stats.dex, '-'),
    CON: parseString(stats.CON || stats.con, '-'),
    INT: parseString(stats.INT || stats.int, '-'),
    WIS: parseString(stats.WIS || stats.wis, '-'),
    CHA: parseString(stats.CHA || stats.cha, '-'),
  }
}

function stripCodeFence(text) {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/u, '')
    .replace(/\s*```$/u, '')
    .trim()
}

function parseStructuredJson(text) {
  const stripped = stripCodeFence(text)

  try {
    return JSON.parse(stripped)
  } catch {
    const firstBrace = stripped.indexOf('{')
    const lastBrace = stripped.lastIndexOf('}')

    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      throw new AdventureBuilderError(
        'The provider returned text, but it was not valid structured adventure JSON.',
        502,
      )
    }

    try {
      return JSON.parse(stripped.slice(firstBrace, lastBrace + 1))
    } catch {
      throw new AdventureBuilderError(
        'The provider returned malformed adventure JSON.',
        502,
      )
    }
  }
}

function normalizeAdventureResponse(value) {
  const input =
    typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {}

  return {
    summary: parseString(input.summary, 'No summary returned.'),
    questHooks: Array.isArray(input.questHooks)
      ? input.questHooks
          .map((hook) => ({
            title: parseString(hook?.title, 'Untitled hook'),
            pitch: parseString(hook?.pitch),
            stakes: parseString(hook?.stakes),
          }))
          .filter((hook) => hook.title || hook.pitch || hook.stakes)
      : [],
    encounters: Array.isArray(input.encounters)
      ? input.encounters
          .map((encounter) => ({
            title: parseString(encounter?.title, 'Untitled encounter'),
            type: normalizeEncounterType(encounter?.type),
            description: parseString(encounter?.description),
            objective: parseString(encounter?.objective),
            opposition: parseString(encounter?.opposition),
            complications: parseString(encounter?.complications),
          }))
          .filter(
            (encounter) =>
              encounter.title ||
              encounter.description ||
              encounter.objective ||
              encounter.opposition ||
              encounter.complications,
          )
      : [],
    loot: Array.isArray(input.loot)
      ? input.loot
          .map((item) => ({
            name: parseString(item?.name, 'Unnamed reward'),
            rarity: normalizeLootRarity(item?.rarity),
            description: parseString(item?.description),
          }))
          .filter((item) => item.name || item.description)
      : [],
    statBlocks: Array.isArray(input.statBlocks)
      ? input.statBlocks
          .map((statBlock) => ({
            name: parseString(statBlock?.name, 'Unnamed creature'),
            role: parseString(statBlock?.role),
            challengeRating: parseString(statBlock?.challengeRating, 'Unknown'),
            armorClass: parseString(statBlock?.armorClass, '-'),
            hitPoints: parseString(statBlock?.hitPoints, '-'),
            speed: parseString(statBlock?.speed, '-'),
            stats: normalizeStats(statBlock?.stats),
            abilities: parseStringArray(statBlock?.abilities),
            actions: parseStringArray(statBlock?.actions),
          }))
          .filter(
            (statBlock) =>
              statBlock.name ||
              statBlock.role ||
              statBlock.abilities.length ||
              statBlock.actions.length,
          )
      : [],
  }
}

function buildAdventureInstructions(worldContext) {
  return [
    ADVENTURE_BUILDER_PROMPT,
    ...(worldContext ? ['', worldContext] : []),
  ].join('\n')
}

export async function buildAdventureFromNarrative(payload) {
  const request = validateAdventurePayload(payload)
  const settings = await readSettings()
  const worldContext = await buildWorldContext({
    userInput: request.narrative,
  })
  const providerResponse = await generateTextWithProvider({
    settings,
    userInput: request.narrative,
    systemInstructions: buildAdventureInstructions(worldContext),
  })
  const structuredAdventure = normalizeAdventureResponse(
    parseStructuredJson(providerResponse.text),
  )

  return {
    ...structuredAdventure,
    provider: providerResponse.provider,
    model: providerResponse.model,
    generatedAt: providerResponse.generatedAt,
  }
}

export { AdventureBuilderError }
