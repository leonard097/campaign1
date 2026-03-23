async function fetchJson(path, options = {}) {
  const { signal, method = 'GET', body } = options
  const headers = body ? { 'Content-Type': 'application/json' } : undefined

  const response = await fetch(path, {
    method,
    signal,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  let payload = null

  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    const message =
      payload?.message ||
      payload?.error?.message ||
      `Request failed with status ${response.status}`
    const error = new Error(message)

    error.status = response.status
    throw error
  }

  return payload
}

export async function getDashboard(signal) {
  const [health, chronicle] = await Promise.all([
    fetchJson('/api/health', { signal }),
    fetchJson('/api/chronicle', { signal }),
  ])

  return { health, chronicle }
}

export async function getSettings(signal) {
  return fetchJson('/api/settings', { signal })
}

export async function searchReferenceLibrary(params = {}, signal) {
  const searchParams = new URLSearchParams()

  if (typeof params.q === 'string' && params.q.trim()) {
    searchParams.set('q', params.q.trim())
  }

  if (typeof params.sourceType === 'string' && params.sourceType.trim()) {
    searchParams.set('sourceType', params.sourceType.trim())
  }

  if (typeof params.sourceName === 'string' && params.sourceName.trim()) {
    searchParams.set('sourceName', params.sourceName.trim())
  }

  if (typeof params.limit !== 'undefined') {
    searchParams.set('limit', String(params.limit))
  }

  const query = searchParams.toString()

  return fetchJson(`/api/reference/search${query ? `?${query}` : ''}`, { signal })
}

export async function getReferenceDocument(id, signal) {
  return fetchJson(`/api/reference/document/${encodeURIComponent(id)}`, { signal })
}

export async function getReferenceChunk(chunkId, signal) {
  return fetchJson(`/api/reference/chunk/${encodeURIComponent(chunkId)}`, { signal })
}

export async function saveSettings(settings) {
  return fetchJson('/api/settings', {
    method: 'PUT',
    body: settings,
  })
}

export async function generateStory(payload) {
  return fetchJson('/api/generate', {
    method: 'POST',
    body: payload,
  })
}

export async function transformAdventure(payload) {
  return fetchJson('/api/adventure-builder/transform', {
    method: 'POST',
    body: payload,
  })
}

export async function getWorldBibleEntries(signal) {
  return fetchJson('/api/world-bible/entries', { signal })
}

export async function createWorldBibleEntry(payload) {
  return fetchJson('/api/world-bible/entries', {
    method: 'POST',
    body: payload,
  })
}

export async function getChapters(signal) {
  return fetchJson('/api/chapters', { signal })
}

export async function createChapter(payload) {
  return fetchJson('/api/chapters', {
    method: 'POST',
    body: payload,
  })
}

export async function createScene(chapterId, payload) {
  return fetchJson(`/api/chapters/${chapterId}/scenes`, {
    method: 'POST',
    body: payload,
  })
}

export async function updateScene(chapterId, sceneId, payload) {
  return fetchJson(`/api/chapters/${chapterId}/scenes/${sceneId}`, {
    method: 'PUT',
    body: payload,
  })
}
