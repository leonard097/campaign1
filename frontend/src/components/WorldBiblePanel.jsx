import { useEffect, useState } from 'react'
import {
  createWorldBibleEntry,
  getWorldBibleEntries,
} from '../lib/api'

const entryTypes = ['NPC', 'Location', 'Faction', 'Item', 'God', 'History']

const initialEntryForm = {
  type: 'NPC',
  title: '',
  tags: '',
  description: '',
  links: [],
}

function normalizeEntry(entry) {
  return {
    id: typeof entry.id === 'string' ? entry.id : '',
    type: typeof entry.type === 'string' ? entry.type : 'History',
    title: typeof entry.title === 'string' ? entry.title : 'Untitled entry',
    tags: Array.isArray(entry.tags) ? entry.tags : [],
    links: Array.isArray(entry.links) ? entry.links : [],
    description: typeof entry.description === 'string' ? entry.description : '',
    excerpt: typeof entry.excerpt === 'string' ? entry.excerpt : '',
    updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : '',
  }
}

function sortEntries(entries) {
  return [...entries].sort((left, right) => left.title.localeCompare(right.title))
}

function filterEntries(entries, search, tag) {
  const normalizedSearch = search.trim().toLowerCase()

  return entries.filter((entry) => {
    const matchesSearch =
      !normalizedSearch ||
      [
        entry.title,
        entry.type,
        entry.description,
        entry.excerpt,
        entry.tags.join(' '),
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearch)

    const matchesTag = !tag || entry.tags.includes(tag)

    return matchesSearch && matchesTag
  })
}

function parseTagsInput(tagsInput) {
  return Array.from(
    new Set(
      tagsInput
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  )
}

function formatDate(value) {
  if (!value) {
    return 'Unknown'
  }

  return new Date(value).toLocaleString()
}

function renderMarkdownBlocks(markdown) {
  const blocks = markdown
    .trim()
    .split(/\n\s*\n/u)
    .map((block) => block.trim())
    .filter(Boolean)

  if (!blocks.length) {
    return <p>No description yet.</p>
  }

  return blocks.map((block, index) => {
    const lines = block.split('\n').map((line) => line.trimEnd())

    if (lines.every((line) => /^\s*[-*]\s+/.test(line))) {
      return (
        <ul key={`list-${index}`} className="world-bible__markdown-list">
          {lines.map((line) => (
            <li key={`${index}-${line}`}>{line.replace(/^\s*[-*]\s+/, '')}</li>
          ))}
        </ul>
      )
    }

    if (lines.every((line) => /^\s*>\s?/.test(line))) {
      return (
        <blockquote key={`quote-${index}`} className="world-bible__markdown-quote">
          {lines.map((line) => line.replace(/^\s*>\s?/, '')).join('\n')}
        </blockquote>
      )
    }

    const headingMatch = block.match(/^(#{1,3})\s+(.+)$/u)

    if (headingMatch) {
      const level = headingMatch[1].length
      const headingClassName =
        level === 1
          ? 'world-bible__markdown-heading world-bible__markdown-heading--major'
          : level === 2
            ? 'world-bible__markdown-heading world-bible__markdown-heading--section'
            : 'world-bible__markdown-heading world-bible__markdown-heading--minor'

      return (
        <p key={`heading-${index}`} className={headingClassName}>
          {headingMatch[2]}
        </p>
      )
    }

    return <p key={`paragraph-${index}`}>{block}</p>
  })
}

function WorldBiblePanel() {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [search, setSearch] = useState('')
  const [selectedTag, setSelectedTag] = useState('')
  const [selectedEntryId, setSelectedEntryId] = useState('')
  const [form, setForm] = useState(initialEntryForm)

  useEffect(() => {
    const controller = new AbortController()

    async function loadEntries() {
      setLoading(true)
      setError('')

      try {
        const nextEntries = await getWorldBibleEntries(controller.signal)
        const normalizedEntries = sortEntries(nextEntries.map(normalizeEntry))

        setEntries(normalizedEntries)

        if (normalizedEntries.length) {
          setSelectedEntryId((currentId) =>
            normalizedEntries.some((entry) => entry.id === currentId)
              ? currentId
              : normalizedEntries[0].id,
          )
        }
      } catch (loadError) {
        if (loadError.name === 'AbortError') {
          return
        }

        setError(
          loadError.message ||
            'Unable to load World Bible entries from the local backend.',
        )
      } finally {
        setLoading(false)
      }
    }

    loadEntries()

    return () => controller.abort()
  }, [])

  const allTags = Array.from(
    new Set(entries.flatMap((entry) => entry.tags)),
  ).sort((left, right) => left.localeCompare(right))
  const filteredEntries = filterEntries(entries, search, selectedTag)

  useEffect(() => {
    if (!filteredEntries.length) {
      if (selectedEntryId) {
        setSelectedEntryId('')
      }

      return
    }

    if (!filteredEntries.some((entry) => entry.id === selectedEntryId)) {
      setSelectedEntryId(filteredEntries[0].id)
    }
  }, [entries, filteredEntries, selectedEntryId])

  const selectedEntry =
    filteredEntries.find((entry) => entry.id === selectedEntryId) ?? null
  const linkedEntries = selectedEntry
    ? selectedEntry.links
        .map((linkId) => entries.find((entry) => entry.id === linkId))
        .filter(Boolean)
    : []
  const incomingLinks = selectedEntry
    ? entries.filter((entry) => entry.links.includes(selectedEntry.id))
    : []

  function handleFormChange(field, value) {
    setForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }))

    setError('')
    setSuccess('')
  }

  function toggleLinkedEntry(linkId) {
    setForm((currentForm) => ({
      ...currentForm,
      links: currentForm.links.includes(linkId)
        ? currentForm.links.filter((currentLink) => currentLink !== linkId)
        : [...currentForm.links, linkId],
    }))

    setError('')
    setSuccess('')
  }

  async function handleCreateEntry(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const createdEntry = normalizeEntry(
        await createWorldBibleEntry({
          type: form.type,
          title: form.title,
          tags: parseTagsInput(form.tags),
          description: form.description,
          links: form.links,
        }),
      )

      setEntries((currentEntries) => sortEntries([...currentEntries, createdEntry]))
      setSelectedEntryId(createdEntry.id)
      setForm((currentForm) => ({
        ...initialEntryForm,
        type: currentForm.type,
      }))
      setSuccess(`Saved "${createdEntry.title}" to the local World Bible.`)
    } catch (saveError) {
      setError(
        saveError.message ||
          'Unable to save the World Bible entry to local storage.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="world-bible">
      <aside className="world-bible__browser">
        <div className="world-bible__browser-head">
          <div>
            <p className="content-card__label">Archive Search</p>
            <h3>Browse entries</h3>
          </div>
          <span className="status-chip status-chip--muted">
            {loading ? 'Loading...' : `${entries.length} entries`}
          </span>
        </div>

        <label className="world-bible__search-field" htmlFor="world-bible-search">
          <span>Search</span>
          <input
            id="world-bible-search"
            className="world-bible__input"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search title, tags, or description..."
          />
        </label>

        <div className="world-bible__tags">
          <button
            type="button"
            className={`world-bible__tag ${!selectedTag ? 'world-bible__tag--active' : ''}`}
            onClick={() => setSelectedTag('')}
          >
            All tags
          </button>

          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              className={`world-bible__tag ${selectedTag === tag ? 'world-bible__tag--active' : ''}`}
              onClick={() => setSelectedTag(tag)}
            >
              {tag}
            </button>
          ))}
        </div>

        <div className="world-bible__list">
          {filteredEntries.length ? (
            filteredEntries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`world-bible__list-item ${selectedEntry?.id === entry.id ? 'world-bible__list-item--active' : ''}`}
                onClick={() => setSelectedEntryId(entry.id)}
              >
                <div className="world-bible__list-item-head">
                  <strong>{entry.title}</strong>
                  <span>{entry.type}</span>
                </div>
                <p>{entry.excerpt || 'No description yet.'}</p>
                <div className="world-bible__list-item-tags">
                  {entry.tags.map((tag) => (
                    <span key={`${entry.id}-${tag}`}>{tag}</span>
                  ))}
                </div>
              </button>
            ))
          ) : (
            <div className="world-bible__empty">
              <p>No entries match the current search and tag filters.</p>
            </div>
          )}
        </div>
      </aside>

      <div className="world-bible__main">
        <form className="world-bible__form" onSubmit={handleCreateEntry}>
          <div className="world-bible__section-head">
            <div>
              <p className="content-card__label">Create Entry</p>
              <h3>Add to the canon</h3>
            </div>
            <span className="world-bible__hint">Saved as local markdown</span>
          </div>

          <div className="world-bible__form-grid">
            <label className="world-bible__field" htmlFor="world-bible-type">
              <span>Entry type</span>
              <select
                id="world-bible-type"
                className="world-bible__select"
                value={form.type}
                onChange={(event) => handleFormChange('type', event.target.value)}
                disabled={saving}
              >
                {entryTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>

            <label className="world-bible__field" htmlFor="world-bible-title">
              <span>Title</span>
              <input
                id="world-bible-title"
                className="world-bible__input"
                type="text"
                value={form.title}
                onChange={(event) => handleFormChange('title', event.target.value)}
                placeholder="The Ashen Duke"
                disabled={saving}
              />
            </label>

            <label
              className="world-bible__field world-bible__field--full"
              htmlFor="world-bible-tags"
            >
              <span>Tags</span>
              <input
                id="world-bible-tags"
                className="world-bible__input"
                type="text"
                value={form.tags}
                onChange={(event) => handleFormChange('tags', event.target.value)}
                placeholder="nobility, curse, drowned archive"
                disabled={saving}
              />
            </label>

            <label
              className="world-bible__field world-bible__field--full"
              htmlFor="world-bible-description"
            >
              <span>Description (Markdown)</span>
              <textarea
                id="world-bible-description"
                className="world-bible__textarea"
                value={form.description}
                onChange={(event) =>
                  handleFormChange('description', event.target.value)
                }
                placeholder={
                  '# Overview\n\nDescribe appearance, motives, secrets, or historical significance...'
                }
                rows={9}
                disabled={saving}
              />
            </label>
          </div>

          <div className="world-bible__links-picker">
            <div className="world-bible__section-head">
              <div>
                <p className="content-card__label">Linked Entries</p>
                <h3>Connect this entry to the wider canon</h3>
              </div>
              <span className="world-bible__hint">{form.links.length} linked</span>
            </div>

            <div className="world-bible__links-grid">
              {entries.length ? (
                entries.map((entry) => (
                  <label key={entry.id} className="world-bible__link-option">
                    <input
                      type="checkbox"
                      checked={form.links.includes(entry.id)}
                      onChange={() => toggleLinkedEntry(entry.id)}
                      disabled={saving}
                    />
                    <span>
                      <strong>{entry.title}</strong>
                      <small>{entry.type}</small>
                    </span>
                  </label>
                ))
              ) : (
                <p className="world-bible__empty-text">
                  Create the first entry, then you can cross-link future ones here.
                </p>
              )}
            </div>
          </div>

          <div className="world-bible__actions">
            <button
              type="submit"
              className="settings-panel__button"
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Entry'}
            </button>
            <span className="world-bible__hint">
              Stored in the matching `/data` collection folder.
            </span>
          </div>

          {error ? <p className="form-message form-message--error">{error}</p> : null}
          {success ? (
            <p className="form-message form-message--success">{success}</p>
          ) : null}
        </form>

        <article className="world-bible__detail">
          <div className="world-bible__section-head">
            <div>
              <p className="content-card__label">Selected Entry</p>
              <h3>{selectedEntry ? selectedEntry.title : 'No entry selected'}</h3>
            </div>
            <span className="world-bible__hint">
              {selectedEntry ? selectedEntry.type : 'Archive detail'}
            </span>
          </div>

          {selectedEntry ? (
            <>
              <div className="world-bible__detail-meta">
                <div>
                  <span>Updated</span>
                  <strong>{formatDate(selectedEntry.updatedAt)}</strong>
                </div>
                <div>
                  <span>Tags</span>
                  <strong>
                    {selectedEntry.tags.length
                      ? selectedEntry.tags.join(', ')
                      : 'No tags yet'}
                  </strong>
                </div>
              </div>

              <div className="world-bible__detail-links">
                <div>
                  <p className="content-card__label">Outgoing Links</p>
                  <div className="world-bible__pill-row">
                    {linkedEntries.length ? (
                      linkedEntries.map((entry) => (
                        <button
                          key={`outgoing-${entry.id}`}
                          type="button"
                          className="world-bible__pill"
                          onClick={() => setSelectedEntryId(entry.id)}
                        >
                          {entry.title}
                        </button>
                      ))
                    ) : (
                      <span className="world-bible__empty-text">No linked entries.</span>
                    )}
                  </div>
                </div>

                <div>
                  <p className="content-card__label">Referenced By</p>
                  <div className="world-bible__pill-row">
                    {incomingLinks.length ? (
                      incomingLinks.map((entry) => (
                        <button
                          key={`incoming-${entry.id}`}
                          type="button"
                          className="world-bible__pill"
                          onClick={() => setSelectedEntryId(entry.id)}
                        >
                          {entry.title}
                        </button>
                      ))
                    ) : (
                      <span className="world-bible__empty-text">
                        No incoming links yet.
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="world-bible__markdown">
                <p className="content-card__label">Markdown Description</p>
                <div className="world-bible__markdown-body">
                  {renderMarkdownBlocks(selectedEntry.description)}
                </div>
              </div>
            </>
          ) : (
            <div className="world-bible__empty">
              <p>Create an entry or adjust your filters to inspect the archive.</p>
            </div>
          )}
        </article>
      </div>
    </section>
  )
}

export default WorldBiblePanel
