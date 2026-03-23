import { useState } from 'react'
import { transformAdventure } from '../lib/api'

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

function normalizeStatBlock(block) {
  const stats =
    typeof block?.stats === 'object' && block.stats !== null && !Array.isArray(block.stats)
      ? block.stats
      : {}

  return {
    name: normalizeString(block?.name, 'Unnamed creature'),
    role: normalizeString(block?.role),
    challengeRating: normalizeString(block?.challengeRating, 'Unknown'),
    armorClass: normalizeString(block?.armorClass, '-'),
    hitPoints: normalizeString(block?.hitPoints, '-'),
    speed: normalizeString(block?.speed, '-'),
    stats: {
      STR: normalizeString(stats.STR, '-'),
      DEX: normalizeString(stats.DEX, '-'),
      CON: normalizeString(stats.CON, '-'),
      INT: normalizeString(stats.INT, '-'),
      WIS: normalizeString(stats.WIS, '-'),
      CHA: normalizeString(stats.CHA, '-'),
    },
    abilities: normalizeStringArray(block?.abilities),
    actions: normalizeStringArray(block?.actions),
  }
}

function normalizeAdventure(value) {
  const input =
    typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {}

  return {
    summary: normalizeString(
      input.summary,
      'Adventure content will appear here after a successful transformation.',
    ),
    questHooks: Array.isArray(input.questHooks)
      ? input.questHooks.map((hook) => ({
          title: normalizeString(hook?.title, 'Untitled hook'),
          pitch: normalizeString(hook?.pitch),
          stakes: normalizeString(hook?.stakes),
        }))
      : [],
    encounters: Array.isArray(input.encounters)
      ? input.encounters.map((encounter) => ({
          title: normalizeString(encounter?.title, 'Untitled encounter'),
          type: normalizeString(encounter?.type, 'exploration'),
          description: normalizeString(encounter?.description),
          objective: normalizeString(encounter?.objective),
          opposition: normalizeString(encounter?.opposition),
          complications: normalizeString(encounter?.complications),
        }))
      : [],
    loot: Array.isArray(input.loot)
      ? input.loot.map((item) => ({
          name: normalizeString(item?.name, 'Unnamed reward'),
          rarity: normalizeString(item?.rarity, 'mundane'),
          description: normalizeString(item?.description),
        }))
      : [],
    statBlocks: Array.isArray(input.statBlocks)
      ? input.statBlocks.map(normalizeStatBlock)
      : [],
    provider: normalizeString(input.provider),
    model: normalizeString(input.model),
    generatedAt: normalizeString(input.generatedAt),
  }
}

function formatDate(value) {
  if (!value) {
    return 'Not generated yet'
  }

  return new Date(value).toLocaleString()
}

function AdventureBuilderPanel({
  latestStoryText,
  latestStoryGeneratedAt,
}) {
  const [narrative, setNarrative] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [adventure, setAdventure] = useState(() => normalizeAdventure(null))

  const hasLatestStory = Boolean(
    typeof latestStoryText === 'string' &&
      latestStoryText.trim() &&
      latestStoryGeneratedAt,
  )

  async function handleBuildAdventure() {
    const trimmedNarrative = narrative.trim()

    if (!trimmedNarrative) {
      setError('Add narrative text or load the latest Story Engine output first.')
      return
    }

    setGenerating(true)
    setError('')

    try {
      const response = await transformAdventure({
        narrative: trimmedNarrative,
      })

      setAdventure(normalizeAdventure(response))
    } catch (buildError) {
      setError(
        buildError.message ||
          'Unable to convert the narrative into structured adventure content.',
      )
    } finally {
      setGenerating(false)
    }
  }

  function handleUseLatestStory() {
    if (!hasLatestStory) {
      setError('Generate story text first, then return here to convert it.')
      return
    }

    setNarrative(latestStoryText)
    setError('')
  }

  return (
    <section className="adventure-builder">
      <div className="adventure-builder__controls">
        <div className="adventure-builder__section-head">
          <div>
            <p className="content-card__label">Narrative Source</p>
            <h3>Adventure conversion input</h3>
          </div>
          <span className="adventure-builder__hint">
            Uses the provider selected in Settings
          </span>
        </div>

        <label className="adventure-builder__field" htmlFor="adventure-source">
          <span>Story or scene text</span>
          <textarea
            id="adventure-source"
            className="adventure-builder__textarea"
            value={narrative}
            onChange={(event) => {
              setNarrative(event.target.value)
              setError('')
            }}
            placeholder="Paste narrative text here or pull in the latest Story Engine output."
            rows={16}
          />
        </label>

        <div className="adventure-builder__handoff">
          <div className="adventure-builder__section-head">
            <div>
              <p className="content-card__label">Story Engine Handoff</p>
              <p className="adventure-builder__copy">
                Pull the latest generated narrative into Adventure Builder.
              </p>
            </div>
            <span className="adventure-builder__hint">
              {hasLatestStory
                ? formatDate(latestStoryGeneratedAt)
                : 'No generated text yet'}
            </span>
          </div>

          <div className="adventure-builder__story-preview">
            <p>
              {hasLatestStory
                ? latestStoryText
                : 'Generate story text in Story Engine and it will be available here for conversion.'}
            </p>
          </div>

          <button
            type="button"
            className="settings-panel__button"
            onClick={handleUseLatestStory}
            disabled={!hasLatestStory || generating}
          >
            Use Latest Story Output
          </button>
        </div>

        <div className="adventure-builder__actions">
          <button
            type="button"
            className="generate-button"
            onClick={handleBuildAdventure}
            disabled={generating}
          >
            {generating ? 'Building Adventure...' : 'Build Adventure'}
          </button>
          <span className="adventure-builder__hint">
            Converts narrative into quest hooks, encounters, loot, and basic stat blocks.
          </span>
        </div>

        {error ? <p className="form-message form-message--error">{error}</p> : null}
      </div>

      <aside className="adventure-builder__output">
        <div className="adventure-builder__section-head">
          <div>
            <p className="content-card__label">Structured Output</p>
            <h3>D&D-ready adventure kit</h3>
          </div>
          <span className="status-chip status-chip--muted">
            {generating
              ? 'Transforming...'
              : adventure.provider
                ? `${adventure.provider} ready`
                : 'Awaiting run'}
          </span>
        </div>

        <div className="adventure-builder__summary">
          <p className="content-card__label">Summary</p>
          <p>{adventure.summary}</p>
        </div>

        <div className="adventure-builder__section">
          <div className="adventure-builder__section-head">
            <div>
              <p className="content-card__label">Quest Hooks</p>
              <h3>{adventure.questHooks.length} hooks</h3>
            </div>
          </div>

          <div className="adventure-builder__card-grid">
            {adventure.questHooks.length ? (
              adventure.questHooks.map((hook) => (
                <article key={`${hook.title}-${hook.pitch}`} className="adventure-builder__card">
                  <h4>{hook.title}</h4>
                  <p>{hook.pitch}</p>
                  <strong>Stakes</strong>
                  <p>{hook.stakes || 'Not specified.'}</p>
                </article>
              ))
            ) : (
              <p className="adventure-builder__empty-text">No hooks generated yet.</p>
            )}
          </div>
        </div>

        <div className="adventure-builder__section">
          <div className="adventure-builder__section-head">
            <div>
              <p className="content-card__label">Encounters</p>
              <h3>{adventure.encounters.length} encounters</h3>
            </div>
          </div>

          <div className="adventure-builder__card-grid">
            {adventure.encounters.length ? (
              adventure.encounters.map((encounter) => (
                <article
                  key={`${encounter.title}-${encounter.type}`}
                  className="adventure-builder__card"
                >
                  <div className="adventure-builder__card-head">
                    <h4>{encounter.title}</h4>
                    <span>{encounter.type}</span>
                  </div>
                  <p>{encounter.description || 'No description returned.'}</p>
                  <strong>Objective</strong>
                  <p>{encounter.objective || 'Not specified.'}</p>
                  <strong>Opposition</strong>
                  <p>{encounter.opposition || 'Not specified.'}</p>
                  <strong>Complications</strong>
                  <p>{encounter.complications || 'Not specified.'}</p>
                </article>
              ))
            ) : (
              <p className="adventure-builder__empty-text">
                No encounters generated yet.
              </p>
            )}
          </div>
        </div>

        <div className="adventure-builder__section">
          <div className="adventure-builder__section-head">
            <div>
              <p className="content-card__label">Loot</p>
              <h3>{adventure.loot.length} rewards</h3>
            </div>
          </div>

          <div className="adventure-builder__card-grid">
            {adventure.loot.length ? (
              adventure.loot.map((item) => (
                <article key={`${item.name}-${item.rarity}`} className="adventure-builder__card">
                  <div className="adventure-builder__card-head">
                    <h4>{item.name}</h4>
                    <span>{item.rarity}</span>
                  </div>
                  <p>{item.description || 'No description returned.'}</p>
                </article>
              ))
            ) : (
              <p className="adventure-builder__empty-text">No loot generated yet.</p>
            )}
          </div>
        </div>

        <div className="adventure-builder__section">
          <div className="adventure-builder__section-head">
            <div>
              <p className="content-card__label">Basic Stat Blocks</p>
              <h3>{adventure.statBlocks.length} blocks</h3>
            </div>
          </div>

          <div className="adventure-builder__card-grid">
            {adventure.statBlocks.length ? (
              adventure.statBlocks.map((statBlock) => (
                <article
                  key={`${statBlock.name}-${statBlock.challengeRating}`}
                  className="adventure-builder__card adventure-builder__card--stat"
                >
                  <div className="adventure-builder__card-head">
                    <h4>{statBlock.name}</h4>
                    <span>{statBlock.challengeRating}</span>
                  </div>
                  <p>{statBlock.role || 'No role provided.'}</p>

                  <div className="adventure-builder__meta">
                    <div>
                      <span>AC</span>
                      <strong>{statBlock.armorClass}</strong>
                    </div>
                    <div>
                      <span>HP</span>
                      <strong>{statBlock.hitPoints}</strong>
                    </div>
                    <div>
                      <span>Speed</span>
                      <strong>{statBlock.speed}</strong>
                    </div>
                  </div>

                  <div className="adventure-builder__stats">
                    {Object.entries(statBlock.stats).map(([label, score]) => (
                      <div key={`${statBlock.name}-${label}`}>
                        <span>{label}</span>
                        <strong>{score}</strong>
                      </div>
                    ))}
                  </div>

                  <strong>Abilities</strong>
                  <ul className="adventure-builder__list">
                    {statBlock.abilities.length ? (
                      statBlock.abilities.map((item) => <li key={item}>{item}</li>)
                    ) : (
                      <li>No special abilities returned.</li>
                    )}
                  </ul>

                  <strong>Actions</strong>
                  <ul className="adventure-builder__list">
                    {statBlock.actions.length ? (
                      statBlock.actions.map((item) => <li key={item}>{item}</li>)
                    ) : (
                      <li>No actions returned.</li>
                    )}
                  </ul>
                </article>
              ))
            ) : (
              <p className="adventure-builder__empty-text">
                No stat blocks generated yet.
              </p>
            )}
          </div>
        </div>

        <ul className="adventure-builder__meta-row">
          <li>
            <span>Provider</span>
            <strong>{adventure.provider || 'From Settings'}</strong>
          </li>
          <li>
            <span>Model</span>
            <strong>{adventure.model || 'Set in Settings'}</strong>
          </li>
          <li className="adventure-builder__meta-item--wide">
            <span>Last transformed</span>
            <strong>{formatDate(adventure.generatedAt)}</strong>
          </li>
        </ul>
      </aside>
    </section>
  )
}

export default AdventureBuilderPanel
