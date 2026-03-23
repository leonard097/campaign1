import { useEffect, useState } from 'react'
import {
  getReferenceChunk,
  getReferenceDocument,
  searchReferenceLibrary,
} from '../lib/api'

const sourceTypeOptions = [
  { value: '', label: 'All' },
  { value: 'sourcebook', label: 'Sourcebook' },
  { value: 'adventure', label: 'Adventure' },
  { value: 'homebrew', label: 'Homebrew' },
]

function normalizeString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function normalizeStringArray(value) {
  return Array.isArray(value)
    ? value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
    : []
}

function normalizeSearchResult(result) {
  return {
    documentId: normalizeString(result?.documentId),
    title: normalizeString(result?.title, 'Untitled reference'),
    sourceType: normalizeString(result?.sourceType, 'unknown'),
    sourceName: normalizeString(result?.sourceName, 'Unknown source'),
    filePath: normalizeString(result?.filePath),
    shortSummary: normalizeString(result?.shortSummary),
    headings: normalizeStringArray(result?.headings),
    tags: normalizeStringArray(result?.tags),
    score: typeof result?.score === 'number' ? result.score : 0,
    bestChunk:
      typeof result?.bestChunk === 'object' && result.bestChunk !== null
        ? {
            chunkId: normalizeString(result.bestChunk.chunkId),
            headingPath: normalizeStringArray(result.bestChunk.headingPath),
            text: normalizeString(result.bestChunk.text),
            estimatedTokens:
              typeof result.bestChunk.estimatedTokens === 'number'
                ? result.bestChunk.estimatedTokens
                : 0,
          }
        : null,
  }
}

function normalizeDocument(document) {
  return {
    id: normalizeString(document?.id),
    title: normalizeString(document?.title, 'Untitled reference'),
    sourceType: normalizeString(document?.sourceType, 'unknown'),
    sourceName: normalizeString(document?.sourceName, 'Unknown source'),
    filePath: normalizeString(document?.filePath),
    headings: normalizeStringArray(document?.headings),
    tags: normalizeStringArray(document?.tags),
    shortSummary: normalizeString(document?.shortSummary),
    fullRawMarkdown: normalizeString(document?.fullRawMarkdown),
    updatedAt: normalizeString(document?.updatedAt),
  }
}

function normalizeChunk(chunk) {
  return {
    chunkId: normalizeString(chunk?.chunkId),
    documentId: normalizeString(chunk?.documentId),
    title: normalizeString(chunk?.title),
    sourceType: normalizeString(chunk?.sourceType),
    sourceName: normalizeString(chunk?.sourceName),
    headingPath: normalizeStringArray(chunk?.headingPath),
    text: normalizeString(chunk?.text),
    estimatedTokens: typeof chunk?.estimatedTokens === 'number' ? chunk.estimatedTokens : 0,
    tags: normalizeStringArray(chunk?.tags),
    filePath: normalizeString(chunk?.filePath),
  }
}

function formatSourceType(value) {
  if (!value) {
    return 'Unknown'
  }

  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`
}

function formatHeadingPath(headingPath, fallbackTitle) {
  return headingPath.length ? headingPath.join(' / ') : fallbackTitle
}

function truncateText(text, maxLength = 160) {
  const normalized = text.replace(/\s+/gu, ' ').trim()

  if (!normalized) {
    return 'No preview available.'
  }

  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, maxLength - 3).trimEnd()}...`
}

function formatDate(value) {
  if (!value) {
    return 'Unknown'
  }

  return new Date(value).toLocaleString()
}

function ReferenceLibraryPanel() {
  const [query, setQuery] = useState('')
  const [sourceType, setSourceType] = useState('')
  const [searchCanonMode, setSearchCanonMode] = useState('Balanced')
  const [results, setResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [searchTotal, setSearchTotal] = useState(0)
  const [selectedDocumentId, setSelectedDocumentId] = useState('')
  const [previewDocument, setPreviewDocument] = useState(null)
  const [previewChunk, setPreviewChunk] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    const timeoutId = window.setTimeout(async () => {
      setSearchLoading(true)
      setSearchError('')

      try {
        const response = await searchReferenceLibrary(
          {
            q: query,
            sourceType,
            limit: 40,
          },
          controller.signal,
        )
        const nextResults = Array.isArray(response?.items)
          ? response.items.map(normalizeSearchResult)
          : []

        setResults(nextResults)
        setSearchTotal(typeof response?.total === 'number' ? response.total : nextResults.length)
        setSearchCanonMode(
          typeof response?.canonMode === 'string' ? response.canonMode : 'Balanced',
        )
        setSelectedDocumentId((currentId) =>
          nextResults.some((result) => result.documentId === currentId)
            ? currentId
            : nextResults[0]?.documentId || '',
        )
      } catch (error) {
        if (error.name === 'AbortError') {
          return
        }

        setResults([])
        setSearchTotal(0)
        setSelectedDocumentId('')
        setSearchError(
          error.message ||
            'Unable to search the local reference library right now.',
        )
      } finally {
        setSearchLoading(false)
      }
    }, 180)

    return () => {
      controller.abort()
      window.clearTimeout(timeoutId)
    }
  }, [query, sourceType])

  const selectedResult =
    results.find((result) => result.documentId === selectedDocumentId) ?? null

  useEffect(() => {
    if (!selectedResult) {
      setPreviewDocument(null)
      setPreviewChunk(null)
      setPreviewError('')
      setPreviewLoading(false)
      return
    }

    const controller = new AbortController()

    async function loadPreview() {
      setPreviewLoading(true)
      setPreviewError('')

      try {
        const [document, chunk] = await Promise.all([
          getReferenceDocument(selectedResult.documentId, controller.signal),
          selectedResult.bestChunk?.chunkId
            ? getReferenceChunk(selectedResult.bestChunk.chunkId, controller.signal)
            : Promise.resolve(null),
        ])

        setPreviewDocument(normalizeDocument(document))
        setPreviewChunk(chunk ? normalizeChunk(chunk) : null)
      } catch (error) {
        if (error.name === 'AbortError') {
          return
        }

        setPreviewDocument(null)
        setPreviewChunk(null)
        setPreviewError(
          error.message ||
            'Unable to load the selected reference preview.',
        )
      } finally {
        setPreviewLoading(false)
      }
    }

    loadPreview()

    return () => controller.abort()
  }, [selectedResult])

  return (
    <section className="reference-library">
      <aside className="reference-library__browser">
        <div className="reference-library__browser-head">
          <div>
            <p className="content-card__label">Reference Search</p>
            <h3>Browse local sources</h3>
          </div>
          <span className="status-chip status-chip--muted">
            {searchLoading ? 'Searching...' : `${searchTotal} results`}
          </span>
        </div>

        <div className="reference-library__controls">
          <label className="reference-library__field" htmlFor="reference-search">
            <span>Search</span>
            <input
              id="reference-search"
              className="reference-library__input"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search rules, monsters, spells, places, items, lore..."
            />
          </label>

          <label className="reference-library__field" htmlFor="reference-source-type">
            <span>Source type</span>
            <select
              id="reference-source-type"
              className="reference-library__select"
              value={sourceType}
              onChange={(event) => setSourceType(event.target.value)}
            >
              {sourceTypeOptions.map((option) => (
                <option key={option.value || 'all'} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className="reference-library__hint">
          Ranking uses Canon Mode: <strong>{searchCanonMode}</strong>
        </p>

        {searchError ? (
          <p className="form-message form-message--error">{searchError}</p>
        ) : null}

        <div className="reference-library__list">
          {results.length ? (
            results.map((result) => {
              const headingPath = formatHeadingPath(
                result.bestChunk?.headingPath ?? [],
                result.title,
              )
              const snippet = truncateText(
                result.bestChunk?.text || result.shortSummary,
                150,
              )

              return (
                <button
                  key={result.documentId}
                  type="button"
                  className={`reference-library__list-item ${selectedResult?.documentId === result.documentId ? 'reference-library__list-item--active' : ''}`}
                  onClick={() => setSelectedDocumentId(result.documentId)}
                >
                  <div className="reference-library__list-item-head">
                    <strong>{result.title}</strong>
                    <span>{formatSourceType(result.sourceType)}</span>
                  </div>

                  <div className="reference-library__list-meta">
                    <span>{result.sourceName}</span>
                    <span>{headingPath}</span>
                  </div>

                  <p>{snippet}</p>
                </button>
              )
            })
          ) : (
            <div className="reference-library__empty">
              <p>
                {searchLoading
                  ? 'Searching the local reference library...'
                  : 'No references match the current search and filter.'}
              </p>
            </div>
          )}
        </div>
      </aside>

      <article className="reference-library__preview">
        <div className="reference-library__preview-head">
          <div>
            <p className="content-card__label">Selected Result</p>
            <h3>{selectedResult ? selectedResult.title : 'No reference selected'}</h3>
          </div>
          <span className="reference-library__hint">
            {selectedResult ? formatSourceType(selectedResult.sourceType) : 'Preview'}
          </span>
        </div>

        {previewError ? (
          <p className="form-message form-message--error">{previewError}</p>
        ) : null}

        {selectedResult ? (
          <>
            <div className="reference-library__meta">
              <div>
                <span>Source Type</span>
                <strong>{formatSourceType(selectedResult.sourceType)}</strong>
              </div>
              <div>
                <span>Source Name</span>
                <strong>{selectedResult.sourceName}</strong>
              </div>
              <div>
                <span>Heading Path</span>
                <strong>
                  {formatHeadingPath(
                    previewChunk?.headingPath ??
                      selectedResult.bestChunk?.headingPath ??
                      [],
                    selectedResult.title,
                  )}
                </strong>
              </div>
              <div>
                <span>Updated</span>
                <strong>{formatDate(previewDocument?.updatedAt)}</strong>
              </div>
              <div className="reference-library__meta-item reference-library__meta-item--wide">
                <span>File</span>
                <strong>{previewDocument?.filePath || selectedResult.filePath}</strong>
              </div>
            </div>

            <div className="reference-library__section">
              <div className="reference-library__section-head">
                <div>
                  <p className="content-card__label">Preview Snippet</p>
                  <h3>Matched passage</h3>
                </div>
                <span className="reference-library__hint">
                  {previewChunk
                    ? `${previewChunk.estimatedTokens} est. tokens`
                    : 'Document summary'}
                </span>
              </div>
              <div className="reference-library__preview-body">
                <p>
                  {previewChunk?.text ||
                    previewDocument?.shortSummary ||
                    selectedResult.shortSummary ||
                    'No preview text available.'}
                </p>
              </div>
            </div>

            <div className="reference-library__section">
              <div className="reference-library__section-head">
                <div>
                  <p className="content-card__label">Headings</p>
                  <h3>Document structure</h3>
                </div>
                <span className="reference-library__hint">
                  {previewDocument?.headings?.length || selectedResult.headings.length} headings
                </span>
              </div>
              <div className="reference-library__pills">
                {(previewDocument?.headings || selectedResult.headings).length ? (
                  (previewDocument?.headings || selectedResult.headings).map((heading) => (
                    <span key={`${selectedResult.documentId}-${heading}`} className="reference-library__pill">
                      {heading}
                    </span>
                  ))
                ) : (
                  <span className="reference-library__empty-text">
                    No headings found in this document.
                  </span>
                )}
              </div>
            </div>

            <div className="reference-library__section">
              <div className="reference-library__section-head">
                <div>
                  <p className="content-card__label">Raw Markdown</p>
                  <h3>Document preview</h3>
                </div>
                <span className="reference-library__hint">
                  {previewLoading ? 'Loading...' : 'Local file only'}
                </span>
              </div>
              <div className="reference-library__markdown-preview">
                <pre>
                  {truncateText(
                    previewDocument?.fullRawMarkdown || selectedResult.shortSummary,
                    1200,
                  )}
                </pre>
              </div>
            </div>
          </>
        ) : (
          <div className="reference-library__empty">
            <p>Search the library to inspect local sourcebook, adventure, and homebrew references.</p>
          </div>
        )}
      </article>
    </section>
  )
}

export default ReferenceLibraryPanel
