import { readSettings } from './settingsService.js'
import { generateTextWithProvider } from './providerTextService.js'
import { buildWorldContext } from './worldContextService.js'

const SYSTEM_PROMPT = `You are a fantasy narrative engine, co-writer, and D&D adventure companion.

STYLE:
- Default to third-person narration
- Focus on characters, not the user
- Classic fantasy tone (older tabletop novel feel)
- Immersive, grounded, atmospheric

RULES:
1. User drives the story
2. Expand, do not override
3. Maintain continuity
4. Keep strong atmosphere
5. Balance narrative and D&D structure

MODES:
- Story Mode: novel prose
- Session Mode: interactive storytelling
- Adventure Mode: convert to game content
- Lore Mode: summarize canon
- Revision Mode: improve writing

Adjust output based on:
- tone
- narration strength
- POV

Always prioritize immersion and consistency.`

const VALID_MODES = new Set([
  'Story Mode',
  'Session Mode',
  'Adventure Mode',
  'Lore Mode',
  'Revision Mode',
])

const VALID_TONES = new Set(['Dark', 'Heroic', 'Mysterious', 'Cozy'])
const VALID_NARRATION = new Set(['Simple', 'Balanced', 'Rich descriptive'])
const VALID_POVS = new Set([
  'Third Person Limited',
  'Third Person Omniscient',
  'Character-focused',
])

const modeGuidance = {
  'Story Mode':
    'Return polished novel-style prose with paragraph breaks and a strong sense of scene progression.',
  'Session Mode':
    'Blend immersive narration with D&D-ready pacing. Advance the scene clearly, preserve room for player choice, and avoid stealing agency.',
  'Adventure Mode':
    'Return concise, usable game material with light markdown headings where helpful, such as Hook, Key Beats, NPCs, Challenges, and Consequences.',
  'Lore Mode':
    'Return a canon-minded summary using clear headings and compact paragraphs or bullets only when they improve reference value.',
  'Revision Mode':
    'If the user provides prose, return the improved passage first. Add a short notes section only when it materially helps explain the revision.',
}

const toneGuidance = {
  Dark:
    'Favor grave stakes, somber texture, and hard-edged consequences while staying grounded rather than melodramatic.',
  Heroic:
    'Favor resolve, noble struggle, and mythic uplift without losing emotional weight or believable danger.',
  Mysterious:
    'Favor veiled truths, eerie wonder, and carefully withheld information that deepens intrigue.',
  Cozy:
    'Favor warmth, intimacy, and gentler emotional texture while still respecting the setting and continuity.',
}

const narrationGuidance = {
  Simple:
    'Keep the prose clear, direct, and lightly descriptive. Use efficient scene-setting and avoid ornate flourishes.',
  Balanced:
    'Use a measured mix of clarity, atmosphere, and detail. Let description support action and character evenly.',
  'Rich descriptive':
    'Lean into lush sensory detail, layered atmosphere, and evocative imagery without burying the scene in excess.',
}

const povGuidance = {
  'Third Person Limited':
    'Stay anchored to one character at a time, revealing only what that viewpoint can plausibly perceive, know, or infer.',
  'Third Person Omniscient':
    'Use a broad storytelling lens with controlled shifts in awareness, but keep transitions smooth and never confusing.',
  'Character-focused':
    'Keep the narrative tightly bound to the emotional and sensory experience of the focal character, even if the grammar remains third-person by default.',
}

class GenerationError extends Error {
  constructor(message, statusCode = 500) {
    super(message)
    this.name = 'GenerationError'
    this.statusCode = statusCode
  }
}

function ensureStringField(value, fieldName) {
  if (typeof value !== 'string') {
    throw new GenerationError(`"${fieldName}" must be a string.`, 400)
  }

  return value.trim()
}

function validateChoice(value, fieldName, validChoices) {
  if (!validChoices.has(value)) {
    throw new GenerationError(`"${fieldName}" has an unsupported value.`, 400)
  }

  return value
}

function validateGeneratePayload(payload) {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new GenerationError('Generation payload must be a JSON object.', 400)
  }

  const userInput = ensureStringField(payload.userInput, 'userInput')
  const mode = ensureStringField(payload.mode, 'mode')
  const tone = ensureStringField(payload.tone, 'tone')
  const narrationStrength = ensureStringField(
    payload.narrationStrength,
    'narrationStrength',
  )
  const pov = ensureStringField(payload.pov, 'pov')

  if (!userInput) {
    throw new GenerationError('Add some story input before generating.', 400)
  }

  return {
    userInput,
    mode: validateChoice(mode, 'mode', VALID_MODES),
    tone: validateChoice(tone, 'tone', VALID_TONES),
    narrationStrength: validateChoice(
      narrationStrength,
      'narrationStrength',
      VALID_NARRATION,
    ),
    pov: validateChoice(pov, 'pov', VALID_POVS),
  }
}

function buildRuntimeInstructions({
  mode,
  tone,
  narrationStrength,
  pov,
}, worldContext) {
  return [
    SYSTEM_PROMPT,
    '',
    'ACTIVE GENERATION SETTINGS:',
    `- Mode: ${mode}`,
    `- Tone: ${tone}`,
    `- Narration strength: ${narrationStrength}`,
    `- POV: ${pov}`,
    '',
    'MODE BEHAVIOR:',
    `- ${modeGuidance[mode]}`,
    '',
    'STYLE ADJUSTMENTS:',
    `- ${toneGuidance[tone]}`,
    `- ${narrationGuidance[narrationStrength]}`,
    `- ${povGuidance[pov]}`,
    ...(worldContext ? ['', worldContext] : []),
    '',
    'OUTPUT:',
    '- Return clean, readable markdown or prose that suits the selected mode.',
    '- Preserve continuity with the user input and only expand what the user has established.',
    '- Keep the result immersive, consistent, and ready to display directly in the app.',
  ].join('\n')
}

function createPublicResponse(text, settings, request) {
  return {
    text,
    provider: settings.provider,
    model: settings.model,
    mode: request.mode,
    tone: request.tone,
    narrationStrength: request.narrationStrength,
    pov: request.pov,
    generatedAt: new Date().toISOString(),
  }
}

export async function generateNarrative(payload) {
  const request = validateGeneratePayload(payload)
  const settings = await readSettings()
  const worldContext = await buildWorldContext(request)
  const runtimeInstructions = buildRuntimeInstructions(request, worldContext)
  const providerResponse = await generateTextWithProvider({
    settings,
    userInput: request.userInput,
    systemInstructions: runtimeInstructions,
  })

  return createPublicResponse(providerResponse.text, {
    ...settings,
    provider: providerResponse.provider,
    model: providerResponse.model,
  }, request)
}

export { GenerationError }
