class ProviderTextError extends Error {
  constructor(message, statusCode = 500) {
    super(message)
    this.name = 'ProviderTextError'
    this.statusCode = statusCode
  }
}

function extractProviderErrorMessage(data, fallbackMessage) {
  if (typeof data?.error?.message === 'string' && data.error.message.trim()) {
    return data.error.message.trim()
  }

  if (
    typeof data?.promptFeedback?.blockReason === 'string' &&
    data.promptFeedback.blockReason.trim()
  ) {
    return `The provider blocked this request (${data.promptFeedback.blockReason.trim()}).`
  }

  if (typeof data?.message === 'string' && data.message.trim()) {
    return data.message.trim()
  }

  return fallbackMessage
}

function normalizeGeminiModel(model) {
  const trimmedModel = typeof model === 'string' ? model.trim() : ''

  if (!trimmedModel) {
    throw new ProviderTextError(
      'Set a Gemini model in Settings before generating.',
      400,
    )
  }

  return trimmedModel.startsWith('models/')
    ? trimmedModel
    : `models/${trimmedModel}`
}

function extractOpenAIText(responseData) {
  const chunks = []

  if (Array.isArray(responseData?.output)) {
    for (const item of responseData.output) {
      if (!item || item.type !== 'message' || !Array.isArray(item.content)) {
        continue
      }

      for (const part of item.content) {
        if (part?.type === 'output_text' && typeof part.text === 'string') {
          chunks.push(part.text)
        }
      }
    }
  }

  if (!chunks.length && typeof responseData?.output_text === 'string') {
    chunks.push(responseData.output_text)
  }

  return chunks.join('\n\n').trim()
}

function extractGeminiText(responseData) {
  const chunks = []

  for (const candidate of responseData?.candidates ?? []) {
    for (const part of candidate?.content?.parts ?? []) {
      if (typeof part?.text === 'string') {
        chunks.push(part.text)
      }
    }
  }

  return chunks.join('\n\n').trim()
}

async function parseJsonResponse(response) {
  const text = await response.text()

  if (!text) {
    return null
  }

  try {
    return JSON.parse(text)
  } catch {
    return { message: text }
  }
}

async function generateWithOpenAI(settings, userInput, systemInstructions, timeoutMs) {
  if (!settings.openaiApiKey && !settings.model) {
    throw new ProviderTextError(
      'Set an OpenAI API key and model in Settings before generating with OpenAI.',
      400,
    )
  }

  if (!settings.openaiApiKey) {
    throw new ProviderTextError(
      'Set an OpenAI API key in Settings before generating with OpenAI.',
      400,
    )
  }

  if (!settings.model) {
    throw new ProviderTextError(
      'Set an OpenAI model in Settings before generating.',
      400,
    )
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.openaiApiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      store: false,
      input: [
        {
          role: 'developer',
          content: [
            {
              type: 'input_text',
              text: systemInstructions,
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: userInput,
            },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  })

  const data = await parseJsonResponse(response)

  if (!response.ok) {
    throw new ProviderTextError(
      extractProviderErrorMessage(
        data,
        `OpenAI request failed with status ${response.status}.`,
      ),
      response.status >= 500 ? 502 : response.status,
    )
  }

  const text = extractOpenAIText(data)

  if (!text) {
    throw new ProviderTextError('OpenAI returned no text output.', 502)
  }

  return {
    text,
    provider: 'OpenAI',
    model: settings.model,
    generatedAt: new Date().toISOString(),
  }
}

async function generateWithGemini(settings, userInput, systemInstructions, timeoutMs) {
  if (!settings.geminiApiKey && !settings.model) {
    throw new ProviderTextError(
      'Set a Gemini API key and model in Settings before generating with Gemini.',
      400,
    )
  }

  if (!settings.geminiApiKey) {
    throw new ProviderTextError(
      'Set a Gemini API key in Settings before generating with Gemini.',
      400,
    )
  }

  const normalizedModel = normalizeGeminiModel(settings.model)
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${normalizedModel}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': settings.geminiApiKey,
      },
      body: JSON.stringify({
        store: false,
        systemInstruction: {
          parts: [
            {
              text: systemInstructions,
            },
          ],
        },
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: userInput,
              },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    },
  )

  const data = await parseJsonResponse(response)

  if (!response.ok) {
    throw new ProviderTextError(
      extractProviderErrorMessage(
        data,
        `Gemini request failed with status ${response.status}.`,
      ),
      response.status >= 500 ? 502 : response.status,
    )
  }

  const text = extractGeminiText(data)

  if (!text) {
    throw new ProviderTextError('Gemini returned no text output.', 502)
  }

  return {
    text,
    provider: 'Gemini',
    model: normalizedModel,
    generatedAt: new Date().toISOString(),
  }
}

export async function generateTextWithProvider({
  settings,
  userInput,
  systemInstructions,
  timeoutMs = 60000,
}) {
  if (typeof userInput !== 'string' || !userInput.trim()) {
    throw new ProviderTextError('Add input text before generating.', 400)
  }

  if (typeof systemInstructions !== 'string' || !systemInstructions.trim()) {
    throw new ProviderTextError(
      'Internal provider instructions were missing for this generation request.',
      500,
    )
  }

  if (settings?.provider === 'Gemini') {
    return generateWithGemini(
      settings,
      userInput.trim(),
      systemInstructions,
      timeoutMs,
    )
  }

  return generateWithOpenAI(
    settings,
    userInput.trim(),
    systemInstructions,
    timeoutMs,
  )
}

export { ProviderTextError }
