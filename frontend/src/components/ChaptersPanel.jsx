import { useEffect, useState } from 'react'
import {
  createChapter,
  createScene,
  getChapters,
  getWorldBibleEntries,
  updateScene,
} from '../lib/api'

const povOptions = [
  'Third Person Limited',
  'Third Person Omniscient',
  'Character-focused',
]

function createSceneForm(defaultPov) {
  return {
    title: '',
    pov: defaultPov || povOptions[0],
    linkedCharacterIds: [],
    linkedLocationIds: [],
  }
}

function createSceneDraft(defaultPov, chapterId = '') {
  return {
    id: '',
    chapterId,
    title: '',
    content: '',
    pov: defaultPov || povOptions[0],
    linkedCharacterIds: [],
    linkedLocationIds: [],
    updatedAt: '',
  }
}

function normalizeEntry(entry) {
  return {
    id: typeof entry.id === 'string' ? entry.id : '',
    type: typeof entry.type === 'string' ? entry.type : '',
    title: typeof entry.title === 'string' ? entry.title : 'Untitled entry',
  }
}

function normalizeScene(scene) {
  return {
    id: typeof scene.id === 'string' ? scene.id : '',
    chapterId: typeof scene.chapterId === 'string' ? scene.chapterId : '',
    title: typeof scene.title === 'string' ? scene.title : 'Untitled scene',
    content: typeof scene.content === 'string' ? scene.content : '',
    pov: povOptions.includes(scene.pov) ? scene.pov : povOptions[0],
    linkedCharacterIds: Array.isArray(scene.linkedCharacterIds)
      ? scene.linkedCharacterIds
      : [],
    linkedLocationIds: Array.isArray(scene.linkedLocationIds)
      ? scene.linkedLocationIds
      : [],
    excerpt: typeof scene.excerpt === 'string' ? scene.excerpt : '',
    updatedAt: typeof scene.updatedAt === 'string' ? scene.updatedAt : '',
  }
}

function normalizeChapter(chapter) {
  return {
    id: typeof chapter.id === 'string' ? chapter.id : '',
    title: typeof chapter.title === 'string' ? chapter.title : 'Untitled chapter',
    createdAt: typeof chapter.createdAt === 'string' ? chapter.createdAt : '',
    updatedAt: typeof chapter.updatedAt === 'string' ? chapter.updatedAt : '',
    sceneCount:
      typeof chapter.sceneCount === 'number'
        ? chapter.sceneCount
        : Array.isArray(chapter.scenes)
          ? chapter.scenes.length
          : 0,
    scenes: Array.isArray(chapter.scenes)
      ? chapter.scenes.map(normalizeScene)
      : [],
  }
}

function formatDate(value) {
  if (!value) {
    return 'Unknown'
  }

  return new Date(value).toLocaleString()
}

function createSnippet(value, fallback) {
  const text = value.replace(/\s+/g, ' ').trim()

  if (!text) {
    return fallback
  }

  if (text.length <= 150) {
    return text
  }

  return `${text.slice(0, 147).trimEnd()}...`
}

function ChaptersPanel({
  latestStoryText,
  latestStoryGeneratedAt,
  defaultPov,
}) {
  const [chapters, setChapters] = useState([])
  const [referenceEntries, setReferenceEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [savingChapter, setSavingChapter] = useState(false)
  const [savingScene, setSavingScene] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [selectedChapterId, setSelectedChapterId] = useState('')
  const [selectedSceneId, setSelectedSceneId] = useState('')
  const [chapterTitle, setChapterTitle] = useState('')
  const [sceneForm, setSceneForm] = useState(() => createSceneForm(defaultPov))
  const [sceneDraft, setSceneDraft] = useState(() => createSceneDraft(defaultPov))

  useEffect(() => {
    const controller = new AbortController()

    async function loadData() {
      setLoading(true)
      setError('')

      try {
        const [loadedChapters, loadedEntries] = await Promise.all([
          getChapters(controller.signal),
          getWorldBibleEntries(controller.signal),
        ])

        setChapters(loadedChapters.map(normalizeChapter))
        setReferenceEntries(loadedEntries.map(normalizeEntry))
      } catch (loadError) {
        if (loadError.name === 'AbortError') {
          return
        }

        setError(
          loadError.message ||
            'Unable to load chapters and scene references from the local backend.',
        )
      } finally {
        setLoading(false)
      }
    }

    loadData()

    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!chapters.length) {
      if (selectedChapterId) {
        setSelectedChapterId('')
      }

      if (selectedSceneId) {
        setSelectedSceneId('')
      }

      return
    }

    const selectedChapter =
      chapters.find((chapter) => chapter.id === selectedChapterId) ?? chapters[0]

    if (selectedChapter.id !== selectedChapterId) {
      setSelectedChapterId(selectedChapter.id)
    }

    if (!selectedChapter.scenes.length) {
      if (selectedSceneId) {
        setSelectedSceneId('')
      }

      return
    }

    if (!selectedChapter.scenes.some((scene) => scene.id === selectedSceneId)) {
      setSelectedSceneId(selectedChapter.scenes[0].id)
    }
  }, [chapters, selectedChapterId, selectedSceneId])

  const selectedChapter =
    chapters.find((chapter) => chapter.id === selectedChapterId) ?? null
  const selectedScene =
    selectedChapter?.scenes.find((scene) => scene.id === selectedSceneId) ?? null

  useEffect(() => {
    if (!selectedScene) {
      setSceneDraft(createSceneDraft(defaultPov, selectedChapter?.id ?? ''))
      return
    }

    setSceneDraft({
      ...selectedScene,
      linkedCharacterIds: [...selectedScene.linkedCharacterIds],
      linkedLocationIds: [...selectedScene.linkedLocationIds],
    })
  }, [defaultPov, selectedChapter?.id, selectedScene])

  const characterEntries = referenceEntries
    .filter((entry) => entry.type === 'NPC')
    .sort((left, right) => left.title.localeCompare(right.title))
  const locationEntries = referenceEntries
    .filter((entry) => entry.type === 'Location')
    .sort((left, right) => left.title.localeCompare(right.title))
  const canAttachLatestStory = Boolean(
    typeof latestStoryText === 'string' &&
      latestStoryText.trim() &&
      latestStoryGeneratedAt,
  )

  function replaceChapterList(nextChapters) {
    setChapters(nextChapters.map(normalizeChapter))
  }

  async function refreshChapters({ focusChapterId, focusSceneId } = {}) {
    const loadedChapters = await getChapters()
    const normalizedChapters = loadedChapters.map(normalizeChapter)

    replaceChapterList(normalizedChapters)

    if (focusChapterId) {
      setSelectedChapterId(focusChapterId)
    }

    if (typeof focusSceneId === 'string') {
      setSelectedSceneId(focusSceneId)
    }
  }

  function handleSceneFormChange(field, value) {
    setSceneForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }))
    setError('')
    setSuccess('')
  }

  function handleSceneDraftChange(field, value) {
    setSceneDraft((currentDraft) => ({
      ...currentDraft,
      [field]: value,
    }))
    setError('')
    setSuccess('')
  }

  function toggleSceneFormLink(field, entryId) {
    setSceneForm((currentForm) => ({
      ...currentForm,
      [field]: currentForm[field].includes(entryId)
        ? currentForm[field].filter((currentId) => currentId !== entryId)
        : [...currentForm[field], entryId],
    }))
    setError('')
    setSuccess('')
  }

  function toggleSceneDraftLink(field, entryId) {
    setSceneDraft((currentDraft) => ({
      ...currentDraft,
      [field]: currentDraft[field].includes(entryId)
        ? currentDraft[field].filter((currentId) => currentId !== entryId)
        : [...currentDraft[field], entryId],
    }))
    setError('')
    setSuccess('')
  }

  async function handleCreateChapter(event) {
    event.preventDefault()
    setSavingChapter(true)
    setError('')
    setSuccess('')

    try {
      const createdChapter = normalizeChapter(
        await createChapter({
          title: chapterTitle,
        }),
      )

      replaceChapterList([...chapters, createdChapter])
      setSelectedChapterId(createdChapter.id)
      setSelectedSceneId('')
      setChapterTitle('')
      setSuccess(`Created "${createdChapter.title}" in the local chapters archive.`)
    } catch (saveError) {
      setError(
        saveError.message || 'Unable to create the chapter in local storage.',
      )
    } finally {
      setSavingChapter(false)
    }
  }

  async function handleCreateScene(event) {
    event.preventDefault()

    if (!selectedChapter) {
      setError('Create or select a chapter before adding scenes.')
      return
    }

    setSavingScene(true)
    setError('')
    setSuccess('')

    try {
      const createdScene = normalizeScene(
        await createScene(selectedChapter.id, sceneForm),
      )

      await refreshChapters({
        focusChapterId: selectedChapter.id,
        focusSceneId: createdScene.id,
      })
      setSceneForm(createSceneForm(defaultPov))
      setSuccess(`Added "${createdScene.title}" under ${selectedChapter.title}.`)
    } catch (saveError) {
      setError(
        saveError.message || 'Unable to create the scene in local storage.',
      )
    } finally {
      setSavingScene(false)
    }
  }

  async function handleSaveScene(event) {
    event.preventDefault()

    if (!selectedChapter || !selectedScene) {
      setError('Select a scene before saving edits.')
      return
    }

    setSavingDraft(true)
    setError('')
    setSuccess('')

    try {
      const savedScene = normalizeScene(
        await updateScene(selectedChapter.id, selectedScene.id, {
          title: sceneDraft.title,
          content: sceneDraft.content,
          pov: sceneDraft.pov,
          linkedCharacterIds: sceneDraft.linkedCharacterIds,
          linkedLocationIds: sceneDraft.linkedLocationIds,
        }),
      )

      await refreshChapters({
        focusChapterId: selectedChapter.id,
        focusSceneId: savedScene.id,
      })
      setSuccess(`Saved scene "${savedScene.title}" locally.`)
    } catch (saveError) {
      setError(saveError.message || 'Unable to save the selected scene.')
    } finally {
      setSavingDraft(false)
    }
  }

  async function handleAttachLatestStory() {
    if (!selectedChapter || !selectedScene) {
      setError('Select a scene before attaching generated text.')
      return
    }

    if (!canAttachLatestStory) {
      setError('Generate text in Story Engine before attaching it to a scene.')
      return
    }

    setSavingDraft(true)
    setError('')
    setSuccess('')

    try {
      const attachedContent = sceneDraft.content.trim()
        ? `${sceneDraft.content.trim()}\n\n${latestStoryText.trim()}`
        : latestStoryText.trim()
      const savedScene = normalizeScene(
        await updateScene(selectedChapter.id, selectedScene.id, {
          title: sceneDraft.title,
          content: attachedContent,
          pov: sceneDraft.pov,
          linkedCharacterIds: sceneDraft.linkedCharacterIds,
          linkedLocationIds: sceneDraft.linkedLocationIds,
        }),
      )

      await refreshChapters({
        focusChapterId: selectedChapter.id,
        focusSceneId: savedScene.id,
      })
      setSuccess(`Attached the latest Story Engine passage to "${savedScene.title}".`)
    } catch (saveError) {
      setError(
        saveError.message ||
          'Unable to attach the latest Story Engine output to the scene.',
      )
    } finally {
      setSavingDraft(false)
    }
  }

  function renderLinkOptions({
    title,
    description,
    entries,
    selectedIds,
    onToggle,
    emptyCopy,
    disabled = false,
  }) {
    return (
      <div className="chapters-panel__link-group">
        <div className="chapters-panel__mini-head">
          <div>
            <p className="content-card__label">{title}</p>
            <p className="chapters-panel__copy">{description}</p>
          </div>
          <span className="chapters-panel__hint">{selectedIds.length} linked</span>
        </div>

        <div className="chapters-panel__link-grid">
          {entries.length ? (
            entries.map((entry) => (
              <label key={`${title}-${entry.id}`} className="chapters-panel__link-option">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(entry.id)}
                  onChange={() => onToggle(entry.id)}
                  disabled={disabled}
                />
                <span>{entry.title}</span>
              </label>
            ))
          ) : (
            <p className="chapters-panel__empty-text">{emptyCopy}</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <section className="chapters-panel">
      <aside className="chapters-panel__outline">
        <div className="chapters-panel__section-head">
          <div>
            <p className="content-card__label">Manuscript Outline</p>
            <h3>Chapters and scenes</h3>
          </div>
          <span className="status-chip status-chip--muted">
            {loading
              ? 'Loading...'
              : `${chapters.length} chapters / ${chapters.reduce(
                  (count, chapter) => count + chapter.sceneCount,
                  0,
                )} scenes`}
          </span>
        </div>

        <div className="chapters-panel__chapter-list">
          {chapters.length ? (
            chapters.map((chapter, chapterIndex) => (
              <div key={chapter.id} className="chapters-panel__chapter-group">
                <button
                  type="button"
                  className={`chapters-panel__chapter-button ${selectedChapter?.id === chapter.id ? 'chapters-panel__chapter-button--active' : ''}`}
                  onClick={() => {
                    setSelectedChapterId(chapter.id)
                    setSelectedSceneId(chapter.scenes[0]?.id ?? '')
                    setError('')
                    setSuccess('')
                  }}
                >
                  <div className="chapters-panel__chapter-button-head">
                    <strong>
                      Chapter {chapterIndex + 1}: {chapter.title}
                    </strong>
                    <span>{chapter.sceneCount} scenes</span>
                  </div>
                  <p>
                    {chapter.scenes.length
                      ? createSnippet(
                          chapter.scenes[0].excerpt,
                          'No scene text saved yet.',
                        )
                      : 'No scenes added yet.'}
                  </p>
                </button>

                <div className="chapters-panel__scene-list">
                  {chapter.scenes.length ? (
                    chapter.scenes.map((scene, sceneIndex) => (
                      <button
                        key={scene.id}
                        type="button"
                        className={`chapters-panel__scene-button ${selectedScene?.id === scene.id ? 'chapters-panel__scene-button--active' : ''}`}
                        onClick={() => {
                          setSelectedChapterId(chapter.id)
                          setSelectedSceneId(scene.id)
                          setError('')
                          setSuccess('')
                        }}
                      >
                        <div className="chapters-panel__scene-button-head">
                          <strong>
                            Scene {sceneIndex + 1}: {scene.title}
                          </strong>
                          <span>{scene.pov}</span>
                        </div>
                        <p>
                          {createSnippet(
                            scene.excerpt,
                            'This scene has no content attached yet.',
                          )}
                        </p>
                      </button>
                    ))
                  ) : (
                    <p className="chapters-panel__empty-text">
                      Add the first scene to start drafting this chapter.
                    </p>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="chapters-panel__empty">
              <p>Create a chapter to begin shaping the manuscript.</p>
            </div>
          )}
        </div>
      </aside>

      <div className="chapters-panel__main">
        <div className="chapters-panel__forms">
          <form className="chapters-panel__card" onSubmit={handleCreateChapter}>
            <div className="chapters-panel__section-head">
              <div>
                <p className="content-card__label">Create Chapter</p>
                <h3>Open a new chapter</h3>
              </div>
              <span className="chapters-panel__hint">Stored as local JSON</span>
            </div>

            <label className="chapters-panel__field" htmlFor="chapter-title">
              <span>Chapter title</span>
              <input
                id="chapter-title"
                className="chapters-panel__input"
                type="text"
                value={chapterTitle}
                onChange={(event) => {
                  setChapterTitle(event.target.value)
                  setError('')
                  setSuccess('')
                }}
                placeholder="Ashes on the Pilgrim Road"
                disabled={savingChapter}
              />
            </label>

            <div className="chapters-panel__actions">
              <button
                type="submit"
                className="settings-panel__button"
                disabled={savingChapter}
              >
                {savingChapter ? 'Creating...' : 'Create Chapter'}
              </button>
            </div>
          </form>

          <form className="chapters-panel__card" onSubmit={handleCreateScene}>
            <div className="chapters-panel__section-head">
              <div>
                <p className="content-card__label">Add Scene</p>
                <h3>{selectedChapter ? selectedChapter.title : 'Select a chapter'}</h3>
              </div>
              <span className="chapters-panel__hint">Stored as local markdown</span>
            </div>

            <label className="chapters-panel__field" htmlFor="scene-title">
              <span>Scene title</span>
              <input
                id="scene-title"
                className="chapters-panel__input"
                type="text"
                value={sceneForm.title}
                onChange={(event) => handleSceneFormChange('title', event.target.value)}
                placeholder="At the shuttered tollhouse"
                disabled={savingScene || !selectedChapter}
              />
            </label>

            <label className="chapters-panel__field" htmlFor="scene-pov">
              <span>POV</span>
              <select
                id="scene-pov"
                className="chapters-panel__select"
                value={sceneForm.pov}
                onChange={(event) => handleSceneFormChange('pov', event.target.value)}
                disabled={savingScene || !selectedChapter}
              >
                {povOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            {renderLinkOptions({
              title: 'Linked Characters',
              description: 'Choose NPCs from the World Bible for this scene.',
              entries: characterEntries,
              selectedIds: sceneForm.linkedCharacterIds,
              onToggle: (entryId) =>
                toggleSceneFormLink('linkedCharacterIds', entryId),
              emptyCopy:
                'Create NPC entries in World Bible to link them into scenes.',
              disabled: savingScene || !selectedChapter,
            })}

            {renderLinkOptions({
              title: 'Linked Locations',
              description: 'Choose locations from the World Bible for this scene.',
              entries: locationEntries,
              selectedIds: sceneForm.linkedLocationIds,
              onToggle: (entryId) =>
                toggleSceneFormLink('linkedLocationIds', entryId),
              emptyCopy:
                'Create location entries in World Bible to link them into scenes.',
              disabled: savingScene || !selectedChapter,
            })}

            <div className="chapters-panel__actions">
              <button
                type="submit"
                className="settings-panel__button"
                disabled={savingScene || !selectedChapter}
              >
                {savingScene ? 'Adding...' : 'Add Scene'}
              </button>
            </div>
          </form>
        </div>

        <form className="chapters-panel__editor" onSubmit={handleSaveScene}>
          <div className="chapters-panel__section-head">
            <div>
              <p className="content-card__label">Scene Editor</p>
              <h3>{selectedScene ? selectedScene.title : 'No scene selected'}</h3>
            </div>
            <span className="chapters-panel__hint">
              {selectedChapter ? selectedChapter.title : 'Choose a chapter first'}
            </span>
          </div>

          {selectedScene ? (
            <>
              <div className="chapters-panel__editor-grid">
                <label className="chapters-panel__field" htmlFor="selected-scene-title">
                  <span>Scene title</span>
                  <input
                    id="selected-scene-title"
                    className="chapters-panel__input"
                    type="text"
                    value={sceneDraft.title}
                    onChange={(event) =>
                      handleSceneDraftChange('title', event.target.value)
                    }
                    disabled={savingDraft}
                  />
                </label>

                <label className="chapters-panel__field" htmlFor="selected-scene-pov">
                  <span>POV</span>
                  <select
                    id="selected-scene-pov"
                    className="chapters-panel__select"
                    value={sceneDraft.pov}
                    onChange={(event) =>
                      handleSceneDraftChange('pov', event.target.value)
                    }
                    disabled={savingDraft}
                  >
                    {povOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="chapters-panel__meta">
                <div>
                  <span>Updated</span>
                  <strong>{formatDate(sceneDraft.updatedAt)}</strong>
                </div>
                <div>
                  <span>Characters</span>
                  <strong>{sceneDraft.linkedCharacterIds.length}</strong>
                </div>
                <div>
                  <span>Locations</span>
                  <strong>{sceneDraft.linkedLocationIds.length}</strong>
                </div>
              </div>

              <div className="chapters-panel__story-card">
                <div className="chapters-panel__mini-head">
                  <div>
                    <p className="content-card__label">Story Engine Handoff</p>
                    <p className="chapters-panel__copy">
                      Attach the latest generated passage to this scene.
                    </p>
                  </div>
                  <span className="chapters-panel__hint">
                    {canAttachLatestStory
                      ? formatDate(latestStoryGeneratedAt)
                      : 'No generated text yet'}
                  </span>
                </div>

                <div className="chapters-panel__story-preview">
                  <p>
                    {canAttachLatestStory
                      ? latestStoryText
                      : 'Generate a passage in Story Engine, then return here to attach it to the selected scene.'}
                  </p>
                </div>

                <button
                  type="button"
                  className="settings-panel__button"
                  onClick={handleAttachLatestStory}
                  disabled={savingDraft || !canAttachLatestStory}
                >
                  {savingDraft ? 'Attaching...' : 'Attach Latest Story Output'}
                </button>
              </div>

              <label className="chapters-panel__field" htmlFor="scene-content">
                <span>Scene content</span>
                <textarea
                  id="scene-content"
                  className="chapters-panel__textarea"
                  value={sceneDraft.content}
                  onChange={(event) =>
                    handleSceneDraftChange('content', event.target.value)
                  }
                  placeholder={
                    'Write the scene here or attach the latest Story Engine output.'
                  }
                  rows={14}
                  disabled={savingDraft}
                />
              </label>

              <div className="chapters-panel__link-sections">
                {renderLinkOptions({
                  title: 'Linked Characters',
                  description: 'Characters visible or important in this scene.',
                  entries: characterEntries,
                  selectedIds: sceneDraft.linkedCharacterIds,
                  onToggle: (entryId) =>
                    toggleSceneDraftLink('linkedCharacterIds', entryId),
                  emptyCopy:
                    'Create NPC entries in World Bible to link them into scene metadata.',
                  disabled: savingDraft,
                })}

                {renderLinkOptions({
                  title: 'Linked Locations',
                  description: 'Places that anchor this scene in the world.',
                  entries: locationEntries,
                  selectedIds: sceneDraft.linkedLocationIds,
                  onToggle: (entryId) =>
                    toggleSceneDraftLink('linkedLocationIds', entryId),
                  emptyCopy:
                    'Create location entries in World Bible to link them into scene metadata.',
                  disabled: savingDraft,
                })}
              </div>

              <div className="chapters-panel__actions">
                <button
                  type="submit"
                  className="settings-panel__button"
                  disabled={savingDraft}
                >
                  {savingDraft ? 'Saving...' : 'Save Scene'}
                </button>
                <span className="chapters-panel__hint">
                  Scene text is stored locally as markdown inside this chapter folder.
                </span>
              </div>
            </>
          ) : (
            <div className="chapters-panel__empty">
              <p>
                Select a scene to edit its title, content, POV, and linked
                characters or locations.
              </p>
            </div>
          )}

          {error ? <p className="form-message form-message--error">{error}</p> : null}
          {success ? (
            <p className="form-message form-message--success">{success}</p>
          ) : null}
        </form>
      </div>
    </section>
  )
}

export default ChaptersPanel
