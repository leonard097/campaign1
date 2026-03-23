import path from 'node:path'
import { dataDirectoryPath, defaultSettings, readFile, saveFile } from './storageService.js'

const settingsFilePath = path.join(dataDirectoryPath, 'settings.json')

function normalizeSettings(value = {}) {
  const input =
    typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {}

  const provider = input.provider === 'Gemini' ? 'Gemini' : 'OpenAI'

  return {
    provider,
    model: typeof input.model === 'string' ? input.model.trim() : '',
    openaiApiKey:
      typeof input.openaiApiKey === 'string' ? input.openaiApiKey.trim() : '',
    geminiApiKey:
      typeof input.geminiApiKey === 'string' ? input.geminiApiKey.trim() : '',
  }
}

export async function readSettings() {
  const parsed = await readFile('settings.json')

  return normalizeSettings(parsed)
}

export async function writeSettings(nextSettings) {
  const currentSettings = await readSettings()
  const mergedSettings = normalizeSettings({
    ...currentSettings,
    ...nextSettings,
  })

  await saveFile('settings.json', mergedSettings)

  return mergedSettings
}

export { defaultSettings, settingsFilePath }
