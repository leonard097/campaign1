import { useEffect, useState } from 'react'
import {
  createSourceNote,
  createWorldBibleEntry,
  generateStory,
  getReferenceIndexStatus,
  getSettings,
  rebuildReferenceIndex,
  saveSettings,
} from './lib/api'
import AdventureBuilderPanel from './components/AdventureBuilderPanel'
import ChaptersPanel from './components/ChaptersPanel'
import ReferenceLibraryPanel from './components/ReferenceLibraryPanel'
import WorldBiblePanel from './components/WorldBiblePanel'
import './App.css'

const storyModes = [
  'Story Mode',
  'Session Mode',
  'Adventure Mode',
  'Lore Mode',
  'Revision Mode',
]

const toneLevels = ['Dark', 'Heroic', 'Mysterious', 'Cozy']
const narrationLevels = ['Simple', 'Balanced', 'Rich descriptive']
const povOptions = [
  'Third Person Limited',
  'Third Person Omniscient',
  'Character-focused',
]
const providerOptions = ['OpenAI', 'Gemini']
const canonModeOptions = [
  'Prefer Homebrew',
  'Prefer Official Sources',
  'Balanced',
]

const initialSettingsForm = {
  provider: 'OpenAI',
  model: '',
  openaiApiKey: '',
  geminiApiKey: '',
  canonMode: 'Balanced',
}

const initialReferenceIndexStatus = {
  indexedFileCount: 0,
  indexedHeadingCount: 0,
  indexedChunkCount: 0,
  lastIndexedAt: '',
}

const initialStoryOutput =
  'Awaiting input. Add a prompt, tune the controls, and press Generate to request story text from the provider selected in Settings.'

const tabs = [
  {
    id: 'story-engine',
    label: 'Story Engine',
    kicker: 'Narrative Core',
    title: 'Forge the central pulse of the tale',
    description:
      'A calm command room for shaping plot beats, character pressure, and scene momentum.',
    spotlight:
      'This section is intentionally reserved for future outlining, drafting prompts, and pacing tools.',
    tags: ['Arc mapping', 'Scene intent', 'Conflict flow'],
    cards: [
      {
        label: 'Planned Focus',
        title: 'Story spine workspace',
        text: 'Use this zone to keep the inciting wound, rising complications, midpoint turn, and final consequence in one readable view.',
        wide: true,
      },
      {
        label: 'Mood',
        title: 'Pressure points',
        items: [
          'Character motives remain visible',
          'Escalation stays measured and coherent',
          'Payoffs can echo earlier choices',
        ],
      },
      {
        label: 'Placeholder',
        title: 'Draft instruments',
        text: 'Future controls for prompts, revisions, and scene cards can slot in here without changing the overall layout.',
      },
    ],
  },
  {
    id: 'reference-library',
    label: 'Reference Library',
    kicker: 'Source Archive',
    title: 'Search the local shelves of rules, lore, and adventure text',
    description:
      'Query your personal markdown sourcebooks, adventures, homebrew notes, and indexes from one focused reference surface.',
    spotlight:
      'Searches rank title matches first, then headings, then body text, while preview panes pull from the local reference indexes and chunks.',
    tags: ['Keyword search', 'Source filters', 'Chunk preview'],
    cards: [
      {
        label: 'Planned Focus',
        title: 'Reference stack',
        text: 'A dedicated browse surface for fast lookup across sourcebooks, adventures, and homebrew material stored locally as markdown.',
        wide: true,
      },
      {
        label: 'Search',
        title: 'Signal over noise',
        items: [
          'Title matches rise to the top first',
          'Heading paths stay visible during chunking',
          'Previews stay grounded in local source text',
        ],
      },
      {
        label: 'Placeholder',
        title: 'Future citations',
        text: 'This space can later grow into citations, bookmarks, and saved searches without changing the layout language.',
      },
    ],
  },
  {
    id: 'world-bible',
    label: 'World Bible',
    kicker: 'Lore Archive',
    title: 'Gather the laws, myths, and memory of the realm',
    description:
      'Create and connect NPCs, locations, factions, items, gods, and history entries in one searchable local archive.',
    spotlight:
      'Search, tag filtering, and cross-linked canon entries are now stored locally as markdown inside the World Bible collections.',
    tags: ['Archive', 'Tags', 'Linked canon'],
    cards: [
      {
        label: 'Planned Focus',
        title: 'Foundational canon',
        text: 'Reserve this area for the unshakable rules of the setting so tone and continuity stay intact across the project.',
        wide: true,
      },
      {
        label: 'Lore Threads',
        title: 'Reference pillars',
        items: [
          'Kingdoms, ruins, and sacred geographies',
          'Belief systems and occult traditions',
          'Lineages, relics, and forbidden histories',
        ],
      },
      {
        label: 'Placeholder',
        title: 'Catalog shelves',
        text: 'Future lists, cards, and detail panes can inhabit this panel while the structure remains clean and stable.',
      },
    ],
  },
  {
    id: 'timeline',
    label: 'Timeline',
    kicker: 'Chronicle Flow',
    title: 'Track every omen, era, and consequence in sequence',
    description:
      'A readable chronology surface for major events, hidden truths, and the passage of time through the world.',
    spotlight:
      'Built to hold future event bands, date markers, and continuity checkpoints without crowding the screen.',
    tags: ['Eras', 'Sequence', 'Continuity'],
    cards: [
      {
        label: 'Planned Focus',
        title: 'Era map',
        text: 'This broad lane is reserved for arranging ancient history, present conflict, and future fallout in one connected view.',
        wide: true,
      },
      {
        label: 'Rhythm',
        title: 'Event strata',
        items: [
          'Civilization-scale turning points',
          'Campaign milestones and revelations',
          'Quiet moments that reframe what came before',
        ],
      },
      {
        label: 'Placeholder',
        title: 'Continuity checks',
        text: 'A future support panel for contradictions, overlap warnings, and reminders about when each thread occurs.',
      },
    ],
  },
  {
    id: 'chapters',
    label: 'Chapters',
    kicker: 'Manuscript Frame',
    title: 'Shape the book one chapter at a time',
    description:
      'Create chapters, build scenes beneath them, and keep drafted text tied to POV, characters, and locations.',
    spotlight:
      'Chapter metadata is saved locally as JSON, while each scene is stored as markdown and can absorb the latest Story Engine output.',
    tags: ['Chapter archive', 'Scene drafting', 'Story handoff'],
    cards: [
      {
        label: 'Planned Focus',
        title: 'Chapter queue',
        text: 'This main workspace is meant for arranging chapters so each one advances plot, mood, and character in deliberate steps.',
        wide: true,
      },
      {
        label: 'Craft',
        title: 'Scene rhythm',
        items: [
          'Opening image and immediate tension',
          'Middle pressure with a clear choice',
          'Closing beat that pulls the reader forward',
        ],
      },
      {
        label: 'Placeholder',
        title: 'Revision markers',
        text: 'Future pass notes, draft states, and chapter-level metadata can live here without reshaping the page.',
      },
    ],
  },
  {
    id: 'adventure-builder',
    label: 'Adventure Builder',
    kicker: 'Session Design',
    title: 'Draft adventures with room for danger and wonder',
    description:
      'Transform narrative into quest hooks, encounters, loot, and fast stat blocks for playable D&D prep.',
    spotlight:
      'Adventure Builder uses the selected AI provider and world context to turn story text into structured tabletop-ready content.',
    tags: ['Quest hooks', 'Encounters', 'Stat blocks'],
    cards: [
      {
        label: 'Planned Focus',
        title: 'Quest board',
        text: 'Use this broad stage later for objective chains, faction tension, and the consequences that follow each choice.',
        wide: true,
      },
      {
        label: 'Toolkit',
        title: 'Encounter palette',
        items: [
          'Mystery, travel, and social pressure',
          'Combat beats with narrative purpose',
          'Treasures, omens, and dangerous bargains',
        ],
      },
      {
        label: 'Placeholder',
        title: 'Player hooks',
        text: 'Future prompts for rumors, motives, and branching complications can slot into this supporting panel.',
      },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    kicker: 'Studio Controls',
    title: 'Keep the workspace tuned and readable',
    description:
      'Configure your local provider choice, model target, and API credentials without leaving the workspace.',
    spotlight:
      'Keys are stored only on this machine in /data/settings.json until a future provider call explicitly uses them.',
    tags: ['Provider', 'Model', 'Local storage'],
    cards: [
      {
        label: 'Planned Focus',
        title: 'Workspace defaults',
        text: 'This main area can eventually hold project naming, saving preferences, and global setup without feeling crowded.',
        wide: true,
      },
      {
        label: 'Display',
        title: 'Readable by design',
        items: [
          'Theme controls and contrast options',
          'Panel density and layout preferences',
          'Small quality-of-life toggles for long sessions',
        ],
      },
      {
        label: 'Placeholder',
        title: 'Future integrations',
        text: 'Reserved for sync options, external tools, and any supporting configuration that arrives later.',
      },
    ],
  },
]

function normalizeSettingsForm(value = {}) {
  const input =
    typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {}
  const rawCanonMode =
    typeof input.canonMode === 'string' ? input.canonMode.trim() : ''

  return {
    provider: input.provider === 'Gemini' ? 'Gemini' : 'OpenAI',
    model: typeof input.model === 'string' ? input.model : '',
    openaiApiKey:
      typeof input.openaiApiKey === 'string' ? input.openaiApiKey : '',
    geminiApiKey:
      typeof input.geminiApiKey === 'string' ? input.geminiApiKey : '',
    canonMode: canonModeOptions.includes(rawCanonMode)
      ? rawCanonMode
      : 'Balanced',
  }
}

function normalizeReferenceIndexStatus(value = {}) {
  const input =
    typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {}

  return {
    indexedFileCount:
      typeof input.indexedFileCount === 'number' ? input.indexedFileCount : 0,
    indexedHeadingCount:
      typeof input.indexedHeadingCount === 'number' ? input.indexedHeadingCount : 0,
    indexedChunkCount:
      typeof input.indexedChunkCount === 'number' ? input.indexedChunkCount : 0,
    lastIndexedAt:
      typeof input.lastIndexedAt === 'string' ? input.lastIndexedAt : '',
  }
}

function normalizeReferenceContextChunk(value) {
  return {
    chunkId: typeof value?.chunkId === 'string' ? value.chunkId : '',
    documentId: typeof value?.documentId === 'string' ? value.documentId : '',
    title: typeof value?.title === 'string' ? value.title : 'Untitled reference',
    sourceType:
      typeof value?.sourceType === 'string' ? value.sourceType : 'unknown',
    sourceName:
      typeof value?.sourceName === 'string' ? value.sourceName : 'Unknown source',
    headingPath: Array.isArray(value?.headingPath) ? value.headingPath : [],
    text: typeof value?.text === 'string' ? value.text : '',
    filePath: typeof value?.filePath === 'string' ? value.filePath : '',
  }
}

function formatReferenceHeadingPath(chunk) {
  return Array.isArray(chunk.headingPath) && chunk.headingPath.length
    ? chunk.headingPath.join(' > ')
    : chunk.title
}

function formatReferenceBlock(chunk) {
  return [
    '[Reference Context]',
    `Source: ${chunk.title} (${chunk.sourceType}: ${chunk.sourceName})`,
    `Heading: ${formatReferenceHeadingPath(chunk)}`,
    `Excerpt: ${chunk.text.trim()}`,
  ].join('\n')
}

function buildLoreEntryDescription(chunk) {
  return [
    `# ${chunk.title}`,
    '',
    `- Source Type: ${chunk.sourceType}`,
    `- Source Name: ${chunk.sourceName}`,
    `- Heading Path: ${formatReferenceHeadingPath(chunk)}`,
    `- File Path: ${chunk.filePath}`,
    '',
    '## Reference Excerpt',
    '',
    `> ${chunk.text.trim()}`,
    '',
    '## Homebrew Use',
    '',
    'Adapt, reinterpret, or reconcile this reference into your own setting canon.',
  ].join('\n')
}

function buildAdventureHookSeed(chunk) {
  return [
    `# Adventure Hook Seed: ${chunk.title}`,
    '',
    `Source: ${chunk.sourceType} / ${chunk.sourceName}`,
    `Heading Path: ${formatReferenceHeadingPath(chunk)}`,
    '',
    '## Canon Spark',
    '',
    chunk.text.trim(),
    '',
    '## Hook Direction',
    '',
    'Turn this source material into a quest hook, rumor, faction pressure point, or encounter setup for the party.',
  ].join('\n')
}

function buildChapterReferenceNote(chunk) {
  return [
    `## Reference Note: ${chunk.title}`,
    '',
    `Source: ${chunk.sourceType} / ${chunk.sourceName}`,
    `Heading Path: ${formatReferenceHeadingPath(chunk)}`,
    '',
    chunk.text.trim(),
  ].join('\n')
}

function buildSourceNotePayload(chunk) {
  return {
    title: `${chunk.title} source note`,
    sourceType: chunk.sourceType,
    sourceName: chunk.sourceName,
    referenceDocumentId: chunk.documentId,
    referenceChunkId: chunk.chunkId,
    headingPath: chunk.headingPath,
    tags: [chunk.sourceType, chunk.sourceName, ...chunk.headingPath]
      .map((value) => value.toLowerCase())
      .filter(Boolean),
    content: [
      `# ${chunk.title}`,
      '',
      `Source: ${chunk.sourceType} / ${chunk.sourceName}`,
      `Heading: ${formatReferenceHeadingPath(chunk)}`,
      `File: ${chunk.filePath}`,
      '',
      '## Saved Excerpt',
      '',
      chunk.text.trim(),
    ].join('\n'),
  }
}

function formatReferenceSnippet(text, maxLength = 180) {
  const normalized = text.replace(/\s+/g, ' ').trim()

  if (!normalized) {
    return 'No reference snippet available.'
  }

  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, maxLength - 3).trimEnd()}...`
}

function formatSourceTypeLabel(value) {
  if (!value) {
    return 'Unknown'
  }

  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`
}

function formatIndexedAt(value) {
  if (!value) {
    return 'Not indexed yet'
  }

  return new Date(value).toLocaleString()
}

function App() {
  const [selectedTab, setSelectedTab] = useState(tabs[0].id)
  const [storyPrompt, setStoryPrompt] = useState('')
  const [storyMode, setStoryMode] = useState(storyModes[0])
  const [toneIndex, setToneIndex] = useState(2)
  const [narrationIndex, setNarrationIndex] = useState(1)
  const [pov, setPov] = useState(povOptions[0])
  const [storyOutput, setStoryOutput] = useState(initialStoryOutput)
  const [storyGenerating, setStoryGenerating] = useState(false)
  const [storyError, setStoryError] = useState('')
  const [storyProvider, setStoryProvider] = useState('')
  const [storyModel, setStoryModel] = useState('')
  const [storyGeneratedAt, setStoryGeneratedAt] = useState('')
  const [useReferenceLibrary, setUseReferenceLibrary] = useState(false)
  const [storyReferenceContextCount, setStoryReferenceContextCount] = useState(0)
  const [storyReferenceResults, setStoryReferenceResults] = useState([])
  const [storyReferenceActionMessage, setStoryReferenceActionMessage] = useState('')
  const [storyReferenceActionError, setStoryReferenceActionError] = useState('')
  const [storyReferenceActionPending, setStoryReferenceActionPending] = useState('')
  const [referenceHookHandoff, setReferenceHookHandoff] = useState(null)
  const [referenceChapterHandoff, setReferenceChapterHandoff] = useState(null)
  const [settingsForm, setSettingsForm] = useState(initialSettingsForm)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsError, setSettingsError] = useState('')
  const [settingsSuccess, setSettingsSuccess] = useState('')
  const [referenceIndexStatus, setReferenceIndexStatus] = useState(
    initialReferenceIndexStatus,
  )
  const [referenceIndexLoaded, setReferenceIndexLoaded] = useState(false)
  const [referenceIndexLoading, setReferenceIndexLoading] = useState(false)
  const [referenceIndexRebuilding, setReferenceIndexRebuilding] = useState(false)
  const [referenceIndexError, setReferenceIndexError] = useState('')
  const [referenceIndexSuccess, setReferenceIndexSuccess] = useState('')
  const activeTab = tabs.find((tab) => tab.id === selectedTab) ?? tabs[0]
  const panelStatus = activeTab.id === 'timeline' ? 'Static Layout' : 'Local Panel'

  useEffect(() => {
    if (selectedTab !== 'settings' || settingsLoaded) {
      return undefined
    }

    const controller = new AbortController()

    async function loadSettings() {
      setSettingsLoading(true)
      setSettingsError('')
      setSettingsSuccess('')

      try {
        const nextSettings = await getSettings(controller.signal)

        setSettingsForm(normalizeSettingsForm(nextSettings))
        setSettingsLoaded(true)
      } catch (error) {
        if (error.name === 'AbortError') {
          return
        }

        setSettingsError(
          'Unable to load local settings from /data/settings.json. Start the backend to edit provider configuration.',
        )
      } finally {
        setSettingsLoading(false)
      }
    }

    loadSettings()

    return () => controller.abort()
  }, [selectedTab, settingsLoaded])

  useEffect(() => {
    if (selectedTab !== 'settings' || referenceIndexLoaded) {
      return undefined
    }

    const controller = new AbortController()

    async function loadReferenceIndexStatus() {
      setReferenceIndexLoading(true)
      setReferenceIndexError('')
      setReferenceIndexSuccess('')

      try {
        const status = await getReferenceIndexStatus(controller.signal)

        setReferenceIndexStatus(normalizeReferenceIndexStatus(status))
        setReferenceIndexLoaded(true)
      } catch (error) {
        if (error.name === 'AbortError') {
          return
        }

        setReferenceIndexError(
          'Unable to load reference index status from the local backend.',
        )
      } finally {
        setReferenceIndexLoading(false)
      }
    }

    loadReferenceIndexStatus()

    return () => controller.abort()
  }, [selectedTab, referenceIndexLoaded])

  async function handleGenerate() {
    const trimmedPrompt = storyPrompt.trim()

    if (!trimmedPrompt) {
      setStoryError('Add a prompt or action before generating.')
      return
    }

    setStoryGenerating(true)
    setStoryError('')
    setStoryReferenceActionMessage('')
    setStoryReferenceActionError('')
    setStoryReferenceResults([])
    setStoryReferenceContextCount(0)

    try {
      const response = await generateStory({
        userInput: trimmedPrompt,
        mode: storyMode,
        tone: toneLevels[toneIndex],
        narrationStrength: narrationLevels[narrationIndex],
        pov,
        useReferenceLibrary,
      })

      setStoryOutput(response.text)
      setStoryProvider(response.provider)
      setStoryModel(response.model)
      setStoryGeneratedAt(response.generatedAt)
      setStoryReferenceContextCount(
        typeof response.referenceContextCount === 'number'
          ? response.referenceContextCount
          : 0,
      )
      setStoryReferenceResults(
        Array.isArray(response.referenceContextChunks)
          ? response.referenceContextChunks.map(normalizeReferenceContextChunk)
          : [],
      )
    } catch (error) {
      setStoryError(
        error.message ||
          'Unable to generate story text. Check the backend connection and provider settings.',
      )
    } finally {
      setStoryGenerating(false)
    }
  }

  function handleSettingsChange(field, value) {
    setSettingsForm((currentSettings) => ({
      ...currentSettings,
      [field]: value,
    }))

    setSettingsError('')
    setSettingsSuccess('')
  }

  function clearReferenceActionMessages() {
    setStoryReferenceActionMessage('')
    setStoryReferenceActionError('')
  }

  function handleInsertReferenceIntoStoryContext(chunk) {
    setStoryPrompt((currentPrompt) => {
      const referenceBlock = formatReferenceBlock(chunk)

      return currentPrompt.trim()
        ? `${currentPrompt.trim()}\n\n${referenceBlock}`
        : referenceBlock
    })
    setSelectedTab('story-engine')
    setStoryReferenceActionError('')
    setStoryReferenceActionMessage(
      `"${chunk.title}" was inserted into the Story Engine prompt as reference context.`,
    )
  }

  async function handleAddReferenceToLoreEntry(chunk) {
    setStoryReferenceActionPending(`lore:${chunk.chunkId}`)
    clearReferenceActionMessages()

    try {
      await createWorldBibleEntry({
        type: 'History',
        title: `${chunk.title} reference`,
        tags: [chunk.sourceType, chunk.sourceName, ...chunk.headingPath],
        description: buildLoreEntryDescription(chunk),
        links: [],
      })

      setStoryReferenceActionMessage(
        `"${chunk.title}" was saved to the World Bible as a lore entry.`,
      )
    } catch (error) {
      setStoryReferenceActionError(
        error.message ||
          'Unable to add the selected reference to the World Bible.',
      )
    } finally {
      setStoryReferenceActionPending('')
    }
  }

  function handleConvertReferenceToAdventureHook(chunk) {
    setReferenceHookHandoff({
      title: chunk.title,
      content: buildAdventureHookSeed(chunk),
      createdAt: new Date().toISOString(),
    })
    setSelectedTab('adventure-builder')
    setStoryReferenceActionError('')
    setStoryReferenceActionMessage(
      `"${chunk.title}" was staged as an adventure hook handoff.`,
    )
  }

  function handleLinkReferenceToCurrentChapter(chunk) {
    setReferenceChapterHandoff({
      title: chunk.title,
      content: buildChapterReferenceNote(chunk),
      createdAt: new Date().toISOString(),
    })
    setSelectedTab('chapters')
    setStoryReferenceActionError('')
    setStoryReferenceActionMessage(
      `"${chunk.title}" was staged for chapter linking.`,
    )
  }

  async function handleSaveReferenceAsSourceNote(chunk) {
    setStoryReferenceActionPending(`note:${chunk.chunkId}`)
    clearReferenceActionMessages()

    try {
      await createSourceNote(buildSourceNotePayload(chunk))

      setStoryReferenceActionMessage(
        `"${chunk.title}" was saved as a local source note.`,
      )
    } catch (error) {
      setStoryReferenceActionError(
        error.message ||
          'Unable to save the selected reference as a source note.',
      )
    } finally {
      setStoryReferenceActionPending('')
    }
  }

  async function handleSettingsSave(event) {
    event.preventDefault()
    setSettingsSaving(true)
    setSettingsError('')
    setSettingsSuccess('')

    try {
      const savedSettings = await saveSettings(settingsForm)

      setSettingsForm(normalizeSettingsForm(savedSettings))
      setSettingsLoaded(true)
      setSettingsSuccess('Saved locally to /data/settings.json.')
    } catch {
      setSettingsError(
        'Unable to save local settings. Start the backend to write /data/settings.json.',
      )
    } finally {
      setSettingsSaving(false)
    }
  }

  async function handleRebuildReferenceIndex() {
    setReferenceIndexRebuilding(true)
    setReferenceIndexError('')
    setReferenceIndexSuccess('')

    try {
      const nextStatus = normalizeReferenceIndexStatus(
        await rebuildReferenceIndex(),
      )

      setReferenceIndexStatus(nextStatus)
      setReferenceIndexLoaded(true)
      setReferenceIndexSuccess(
        `Rebuilt the reference library indexes for ${nextStatus.indexedFileCount} files and ${nextStatus.indexedChunkCount} chunks.`,
      )
    } catch (error) {
      setReferenceIndexError(
        error.message ||
          'Unable to rebuild the reference library indexes from /data/reference.',
      )
    } finally {
      setReferenceIndexRebuilding(false)
    }
  }

  return (
    <div className="workspace">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <p className="eyebrow">Dark Fantasy Studio</p>
          <h1>Mythic Chronicle</h1>
          <p className="sidebar__copy">
            A clean command room for worldbuilding, plotting, and adventure design.
          </p>
        </div>

        <nav className="sidebar__nav" aria-label="Primary tabs" role="tablist">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTab.id

            return (
              <button
                key={tab.id}
                id={`${tab.id}-tab`}
                className={`tab-button ${isActive ? 'tab-button--active' : ''}`}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`${tab.id}-panel`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setSelectedTab(tab.id)}
              >
                <span className="tab-button__label">{tab.label}</span>
                <span className="tab-button__hint">{tab.kicker}</span>
              </button>
            )
          })}
        </nav>

        <div className="sidebar__note">
          <p className="eyebrow">Workspace State</p>
          <p>
            Story, lore, chapter, adventure, and settings tools now run through
            the local backend. Timeline is still a layout shell.
          </p>
        </div>
      </aside>

      <main className="content-area">
        <section
          className="content-shell"
          key={activeTab.id}
          id={`${activeTab.id}-panel`}
          role="tabpanel"
          aria-labelledby={`${activeTab.id}-tab`}
        >
          <header className="hero-panel">
            <div className="hero-panel__copy">
              <p className="eyebrow">{activeTab.kicker}</p>
              <h2>{activeTab.title}</h2>
              <p className="hero-panel__description">{activeTab.description}</p>
            </div>

            <div className="hero-panel__aside">
              <span className="status-chip">{panelStatus}</span>
              <p>{activeTab.spotlight}</p>
            </div>
          </header>

          <ul className="tag-row" aria-label={`${activeTab.label} focus areas`}>
            {activeTab.tags.map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>

          {activeTab.id === 'story-engine' ? (
            <section className="story-engine">
              <div className="story-engine__controls">
                <div className="story-engine__field story-engine__field--full">
                  <label htmlFor="story-prompt">Prompt or action</label>
                  <textarea
                    id="story-prompt"
                    className="story-engine__textarea"
                    value={storyPrompt}
                    onChange={(event) => setStoryPrompt(event.target.value)}
                    placeholder="Describe what should happen next, ask for a rewrite, or sketch a scene prompt..."
                    rows={8}
                  />
                </div>

                <div className="story-engine__controls-grid">
                  <div className="story-engine__field">
                    <label htmlFor="story-mode">Mode</label>
                    <select
                      id="story-mode"
                      className="story-engine__select"
                      value={storyMode}
                      onChange={(event) => setStoryMode(event.target.value)}
                    >
                      {storyModes.map((mode) => (
                        <option key={mode} value={mode}>
                          {mode}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="story-engine__field">
                    <label htmlFor="story-pov">POV</label>
                    <select
                      id="story-pov"
                      className="story-engine__select"
                      value={pov}
                      onChange={(event) => setPov(event.target.value)}
                    >
                      {povOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="story-engine__field story-engine__field--slider">
                    <div className="story-engine__field-head">
                      <label htmlFor="tone-slider">Tone</label>
                      <span>{toneLevels[toneIndex]}</span>
                    </div>
                    <input
                      id="tone-slider"
                      className="story-engine__slider"
                      type="range"
                      min="0"
                      max={toneLevels.length - 1}
                      step="1"
                      value={toneIndex}
                      onChange={(event) => setToneIndex(Number(event.target.value))}
                    />
                    <div className="story-engine__slider-labels" aria-hidden="true">
                      {toneLevels.map((tone) => (
                        <span key={tone}>{tone}</span>
                      ))}
                    </div>
                  </div>

                  <div className="story-engine__field story-engine__field--slider">
                    <div className="story-engine__field-head">
                      <label htmlFor="narration-slider">Narration strength</label>
                      <span>{narrationLevels[narrationIndex]}</span>
                    </div>
                    <input
                      id="narration-slider"
                      className="story-engine__slider"
                      type="range"
                      min="0"
                      max={narrationLevels.length - 1}
                      step="1"
                      value={narrationIndex}
                      onChange={(event) =>
                        setNarrationIndex(Number(event.target.value))
                      }
                    />
                    <div className="story-engine__slider-labels" aria-hidden="true">
                      {narrationLevels.map((level) => (
                        <span key={level}>{level}</span>
                      ))}
                    </div>
                  </div>
                </div>

                <label
                  className="story-engine__toggle"
                  htmlFor="story-reference-library"
                >
                  <input
                    id="story-reference-library"
                    className="story-engine__toggle-input"
                    type="checkbox"
                    checked={useReferenceLibrary}
                    onChange={(event) =>
                      setUseReferenceLibrary(event.target.checked)
                    }
                  />
                  <span className="story-engine__toggle-copy">
                    <strong>Use Reference Library</strong>
                    <small>
                      Search top matching local reference chunks and inject them as concise
                      Reference Context before generation.
                    </small>
                  </span>
                </label>

                <button
                  type="button"
                  className="generate-button"
                  onClick={handleGenerate}
                  disabled={storyGenerating}
                >
                  {storyGenerating ? 'Generating...' : 'Generate'}
                </button>

                {useReferenceLibrary ? (
                  <div className="story-engine__reference-status">
                    <p className="content-card__label">Reference Retrieval</p>
                    <p className="story-engine__reference-status-text">
                      When matches are found, you can turn them into lore notes, chapter links,
                      adventure hooks, or direct story context from this panel.
                    </p>
                  </div>
                ) : null}
              </div>

              <aside className="story-engine__output">
                <div className="story-engine__output-header">
                  <div>
                    <p className="content-card__label">AI Response</p>
                    <h3>Output display</h3>
                  </div>
                  <span className="status-chip status-chip--muted">
                    {storyGenerating
                      ? 'Generating...'
                      : storyProvider
                        ? `${storyProvider} ready`
                        : 'Awaiting run'}
                  </span>
                </div>

                {storyError ? (
                  <p className="form-message form-message--error">{storyError}</p>
                ) : null}

                <div className="story-engine__output-body">
                  <p>{storyOutput}</p>
                </div>

                <ul className="story-engine__meta">
                  <li>
                    <span>Mode</span>
                    <strong>{storyMode}</strong>
                  </li>
                  <li>
                    <span>Tone</span>
                    <strong>{toneLevels[toneIndex]}</strong>
                  </li>
                  <li>
                    <span>Narration</span>
                    <strong>{narrationLevels[narrationIndex]}</strong>
                  </li>
                  <li>
                    <span>POV</span>
                    <strong>{pov}</strong>
                  </li>
                  <li>
                    <span>Provider</span>
                    <strong>{storyProvider || 'From Settings'}</strong>
                  </li>
                  <li>
                    <span>Model</span>
                    <strong>{storyModel || 'Set in Settings'}</strong>
                  </li>
                  <li className="story-engine__meta-item story-engine__meta-item--wide">
                    <span>Last generated</span>
                    <strong>
                      {storyGeneratedAt
                        ? new Date(storyGeneratedAt).toLocaleString()
                        : 'Not generated yet'}
                    </strong>
                  </li>
                  <li>
                    <span>Reference Library</span>
                    <strong>
                      {useReferenceLibrary
                        ? storyReferenceContextCount > 0
                          ? `${storyReferenceContextCount} chunks used`
                          : 'Enabled'
                        : 'Disabled'}
                    </strong>
                  </li>
                </ul>

                {useReferenceLibrary ? (
                  <div className="story-engine__reference-actions">
                    <div className="story-engine__reference-actions-head">
                      <div>
                        <p className="content-card__label">Reference Actions</p>
                        <h3>Matched reference chunks</h3>
                      </div>
                      <span className="story-engine__reference-hint">
                        {storyReferenceResults.length
                          ? `${storyReferenceResults.length} chunks ready`
                          : 'No chunks found yet'}
                      </span>
                    </div>

                    {storyReferenceActionError ? (
                      <p className="form-message form-message--error">
                        {storyReferenceActionError}
                      </p>
                    ) : null}

                    {storyReferenceActionMessage ? (
                      <p className="form-message form-message--success">
                        {storyReferenceActionMessage}
                      </p>
                    ) : null}

                    {storyReferenceResults.length ? (
                      <div className="story-engine__reference-list">
                        {storyReferenceResults.map((chunk) => (
                          <article
                            key={chunk.chunkId}
                            className="story-engine__reference-card"
                          >
                            <div className="story-engine__reference-card-head">
                              <strong>{chunk.title}</strong>
                              <span>{formatSourceTypeLabel(chunk.sourceType)}</span>
                            </div>

                            <div className="story-engine__reference-meta">
                              <span>{chunk.sourceName}</span>
                              <span>{formatReferenceHeadingPath(chunk)}</span>
                            </div>

                            <p>{formatReferenceSnippet(chunk.text)}</p>

                            <div className="story-engine__reference-button-row">
                              <button
                                type="button"
                                className="story-engine__reference-button"
                                onClick={() =>
                                  handleInsertReferenceIntoStoryContext(chunk)
                                }
                              >
                                Insert into story context
                              </button>
                              <button
                                type="button"
                                className="story-engine__reference-button"
                                onClick={() => handleAddReferenceToLoreEntry(chunk)}
                                disabled={
                                  storyReferenceActionPending === `lore:${chunk.chunkId}`
                                }
                              >
                                {storyReferenceActionPending === `lore:${chunk.chunkId}`
                                  ? 'Saving lore...'
                                  : 'Add to lore entry'}
                              </button>
                              <button
                                type="button"
                                className="story-engine__reference-button"
                                onClick={() =>
                                  handleConvertReferenceToAdventureHook(chunk)
                                }
                              >
                                Convert to adventure hook
                              </button>
                              <button
                                type="button"
                                className="story-engine__reference-button"
                                onClick={() =>
                                  handleLinkReferenceToCurrentChapter(chunk)
                                }
                              >
                                Link to current chapter
                              </button>
                              <button
                                type="button"
                                className="story-engine__reference-button"
                                onClick={() => handleSaveReferenceAsSourceNote(chunk)}
                                disabled={
                                  storyReferenceActionPending === `note:${chunk.chunkId}`
                                }
                              >
                                {storyReferenceActionPending === `note:${chunk.chunkId}`
                                  ? 'Saving note...'
                                  : 'Save as source note'}
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p className="story-engine__reference-empty">
                        Generate with Reference Library enabled to surface actionable source
                        chunks here.
                      </p>
                    )}
                  </div>
                ) : null}
              </aside>
            </section>
          ) : activeTab.id === 'world-bible' ? (
            <WorldBiblePanel />
          ) : activeTab.id === 'reference-library' ? (
            <ReferenceLibraryPanel />
          ) : activeTab.id === 'chapters' ? (
            <ChaptersPanel
              latestStoryText={storyOutput}
              latestStoryGeneratedAt={storyGeneratedAt}
              defaultPov={pov}
              referenceLinkHandoff={referenceChapterHandoff}
              onConsumeReferenceLink={() => setReferenceChapterHandoff(null)}
            />
          ) : activeTab.id === 'adventure-builder' ? (
            <AdventureBuilderPanel
              latestStoryText={storyOutput}
              latestStoryGeneratedAt={storyGeneratedAt}
              referenceHookHandoff={referenceHookHandoff}
            />
          ) : activeTab.id === 'settings' ? (
            <section className="settings-panel">
              <form className="settings-panel__form" onSubmit={handleSettingsSave}>
                <div className="settings-panel__intro">
                  <p className="content-card__label">Local Provider Settings</p>
                  <h3>Credentials and model target</h3>
                  <p className="content-card__text">
                    These keys are saved only to the local backend file at{' '}
                    <code>/data/settings.json</code>. This screen does not send
                    them to OpenAI or Gemini. Canon Mode also lives here and
                    guides how local reference sources are ranked.
                  </p>
                </div>

                <div className="settings-panel__grid">
                  <div className="settings-panel__field">
                    <label htmlFor="settings-provider">Provider</label>
                    <select
                      id="settings-provider"
                      className="settings-panel__select"
                      value={settingsForm.provider}
                      onChange={(event) =>
                        handleSettingsChange('provider', event.target.value)
                      }
                      disabled={settingsLoading || settingsSaving}
                    >
                      {providerOptions.map((provider) => (
                        <option key={provider} value={provider}>
                          {provider}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="settings-panel__field">
                    <label htmlFor="settings-model">Model</label>
                    <input
                      id="settings-model"
                      className="settings-panel__input"
                      type="text"
                      value={settingsForm.model}
                      onChange={(event) =>
                        handleSettingsChange('model', event.target.value)
                      }
                      placeholder="gpt-5.4-mini or gemini-2.5-pro"
                      disabled={settingsLoading || settingsSaving}
                      spellCheck={false}
                    />
                  </div>

                  <div className="settings-panel__field settings-panel__field--full">
                    <label htmlFor="settings-canon-mode">Canon Mode</label>
                    <select
                      id="settings-canon-mode"
                      className="settings-panel__select"
                      value={settingsForm.canonMode}
                      onChange={(event) =>
                        handleSettingsChange('canonMode', event.target.value)
                      }
                      disabled={settingsLoading || settingsSaving}
                    >
                      {canonModeOptions.map((canonMode) => (
                        <option key={canonMode} value={canonMode}>
                          {canonMode}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="settings-panel__field settings-panel__field--full">
                    <label htmlFor="settings-openai-key">OpenAI API Key</label>
                    <input
                      id="settings-openai-key"
                      className="settings-panel__input"
                      type="password"
                      value={settingsForm.openaiApiKey}
                      onChange={(event) =>
                        handleSettingsChange('openaiApiKey', event.target.value)
                      }
                      placeholder="sk-..."
                      disabled={settingsLoading || settingsSaving}
                      autoComplete="new-password"
                      spellCheck={false}
                    />
                  </div>

                  <div className="settings-panel__field settings-panel__field--full">
                    <label htmlFor="settings-gemini-key">Gemini API Key</label>
                    <input
                      id="settings-gemini-key"
                      className="settings-panel__input"
                      type="password"
                      value={settingsForm.geminiApiKey}
                      onChange={(event) =>
                        handleSettingsChange('geminiApiKey', event.target.value)
                      }
                      placeholder="AIza..."
                      disabled={settingsLoading || settingsSaving}
                      autoComplete="new-password"
                      spellCheck={false}
                    />
                  </div>
                </div>

                <div className="settings-panel__actions">
                  <button
                    type="submit"
                    className="settings-panel__button"
                    disabled={settingsLoading || settingsSaving}
                  >
                    {settingsSaving ? 'Saving...' : 'Save Settings'}
                  </button>

                  <span className="settings-panel__hint">
                    {settingsLoading
                      ? 'Loading local settings...'
                      : 'Stored locally only.'}
                  </span>
                </div>

                {settingsError ? (
                  <p className="form-message form-message--error">{settingsError}</p>
                ) : null}

                {settingsSuccess ? (
                  <p className="form-message form-message--success">
                    {settingsSuccess}
                  </p>
                ) : null}

                <section className="settings-panel__reference">
                  <div className="settings-panel__summary">
                    <p className="content-card__label">Reference Library Index</p>
                    <h3>Rebuild local search indexes</h3>
                    <p className="content-card__text">
                      Rescan <code>/data/reference</code>, rebuild the JSON indexes,
                      and refresh the searchable file and chunk counts used by the app.
                    </p>
                  </div>

                  <div className="settings-panel__reference-meta">
                    <div>
                      <span>Indexed files</span>
                      <strong>{referenceIndexStatus.indexedFileCount}</strong>
                    </div>
                    <div>
                      <span>Indexed chunks</span>
                      <strong>{referenceIndexStatus.indexedChunkCount}</strong>
                    </div>
                    <div>
                      <span>Indexed headings</span>
                      <strong>{referenceIndexStatus.indexedHeadingCount}</strong>
                    </div>
                    <div>
                      <span>Last indexed</span>
                      <strong>{formatIndexedAt(referenceIndexStatus.lastIndexedAt)}</strong>
                    </div>
                  </div>

                  <div className="settings-panel__actions">
                    <button
                      type="button"
                      className="settings-panel__button"
                      onClick={handleRebuildReferenceIndex}
                      disabled={
                        settingsLoading ||
                        settingsSaving ||
                        referenceIndexLoading ||
                        referenceIndexRebuilding
                      }
                    >
                      {referenceIndexRebuilding
                        ? 'Rebuilding...'
                        : 'Rebuild Reference Index'}
                    </button>

                    <span className="settings-panel__hint">
                      {referenceIndexLoading
                        ? 'Loading current index status...'
                        : 'Rescans local markdown and rewrites every reference index file.'}
                    </span>
                  </div>

                  {referenceIndexError ? (
                    <p className="form-message form-message--error">
                      {referenceIndexError}
                    </p>
                  ) : null}

                  {referenceIndexSuccess ? (
                    <p className="form-message form-message--success">
                      {referenceIndexSuccess}
                    </p>
                  ) : null}
                </section>
              </form>

              <aside className="settings-panel__info">
                <div className="settings-panel__summary">
                  <p className="content-card__label">Current Selection</p>
                  <h3>Runtime target</h3>
                  <p className="content-card__text">
                    Choose which provider and model future AI calls should use.
                    Canon Mode also controls whether homebrew, official material,
                    or a balanced mix gets ranking priority during reference retrieval.
                  </p>
                </div>

                <ul className="settings-panel__meta">
                  <li>
                    <span>Provider</span>
                    <strong>{settingsForm.provider}</strong>
                  </li>
                  <li>
                    <span>Model</span>
                    <strong>{settingsForm.model || 'Not set yet'}</strong>
                  </li>
                  <li>
                    <span>Canon Mode</span>
                    <strong>{settingsForm.canonMode}</strong>
                  </li>
                  <li>
                    <span>OpenAI Key</span>
                    <strong>
                      {settingsForm.openaiApiKey ? 'Saved locally' : 'Not set'}
                    </strong>
                  </li>
                  <li>
                    <span>Gemini Key</span>
                    <strong>
                      {settingsForm.geminiApiKey ? 'Saved locally' : 'Not set'}
                    </strong>
                  </li>
                  <li className="settings-panel__meta-item settings-panel__meta-item--wide">
                    <span>Storage</span>
                    <strong>/data/settings.json</strong>
                  </li>
                </ul>
              </aside>
            </section>
          ) : (
            <section className="card-grid">
              {activeTab.cards.map((card) => (
                <article
                  key={card.title}
                  className={`content-card ${card.wide ? 'content-card--wide' : ''}`}
                >
                  <p className="content-card__label">{card.label}</p>
                  <h3>{card.title}</h3>

                  {'items' in card ? (
                    <ul className="content-card__list">
                      {card.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="content-card__text">{card.text}</p>
                  )}
                </article>
              ))}
            </section>
          )}

          <footer className="content-footer">
            <p className="content-footer__label">Selected Section</p>
            <p className="content-footer__text">
              {activeTab.id === 'story-engine'
                ? 'Story Engine is active. Generate now sends your prompt and control selections to the local /api/generate route, which uses the provider and Canon Mode configured in Settings.'
                : activeTab.id === 'reference-library'
                  ? 'Reference Library is active. Searches query the local reference indexes and chunk records, and ranking now respects the Canon Mode saved in Settings.'
                  : activeTab.id === 'world-bible'
                    ? 'World Bible is active. Entries are searchable, filterable by tag, and saved as linked local markdown files in the matching /data collection folders.'
                  : activeTab.id === 'chapters'
                    ? 'Chapters is active. Chapters save locally as JSON, scenes save as markdown, and the latest Story Engine output can be attached directly to the selected scene.'
                    : activeTab.id === 'adventure-builder'
                      ? 'Adventure Builder is active. Narrative can be transformed through the local AI route into structured quest hooks, encounters, loot, and basic stat blocks.'
                : activeTab.id === 'settings'
                  ? 'Settings is active. API keys, Canon Mode, and the Reference Library index are all managed locally from this panel.'
                  : `${activeTab.label} is active. The main panel swaps between static layout placeholders for each tab.`}
            </p>
          </footer>
        </section>
      </main>
    </div>
  )
}

export default App
