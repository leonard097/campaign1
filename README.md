# Mythic Chronicle

`mythic-chronicle` is a local-only full-stack starter for a personal D&D storytelling and novel writing assistant.

## Project Structure

```text
mythic-chronicle/
  frontend/  React + Vite client
  backend/   Express API server
  data/      Local JSON files for campaign and writing data
    reference/
      sourcebooks/  Your local markdown sourcebooks
      adventures/   Your local markdown adventures
      homebrew/     Your local markdown homebrew notes
      indexes/      Your local markdown indexes and lookup files
```

## Install

From the project root:

```bash
cd mythic-chronicle
npm install
```

This uses npm workspaces, so one install command sets up the root, frontend, and backend packages together.

## Run

Start both apps together:

```bash
npm run dev
```

Run one side at a time:

```bash
npm run dev:backend
npm run dev:frontend
```

## Local URLs

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3001`

The Vite frontend proxies `/api` requests to the local Express backend during development.

## Current API

- `GET /api/health`
- `GET /api/chronicle`
- `GET /api/references`
- `GET /api/references/content?path=reference/sourcebooks/example.md`
- `GET /api/reference/search?q=grappling`
- `GET /api/reference/index-status`
- `GET /api/reference/document/:id`
- `GET /api/reference/chunk/:chunkId`
- `POST /api/reference/rebuild`
- `POST /api/source-notes`

## Notes

- No authentication is included.
- Data lives in [`/data/chronicle.json`](./data/chronicle.json).
- The backend auto-creates `/data/reference/sourcebooks`, `/data/reference/adventures`, `/data/reference/homebrew`, and `/data/reference/indexes`.
- The backend also creates `/data/source-notes` for saved source snippets and canon support notes captured from Story Engine reference actions.
- Place your own `.md` files anywhere inside those folders. The backend scans them recursively, parses each markdown source into a structured record, and keeps JSON indexes at `/data/reference/indexes/reference-index.json`, `/data/reference/indexes/headings-index.json`, and `/data/reference/indexes/reference-chunks.json`.
- Parsed reference records include stable IDs, titles, inferred source metadata, headings, tags, summaries, raw markdown, filename, and modified date for local search and lookup.
- The ingestion pipeline also splits files into smaller heading-aware chunks with preserved heading paths, token estimates, and per-chunk tags for future chunk-level search.
- `/api/reference/search` supports keyword search plus optional `sourceType`, `sourceName`, and `limit` query params. Search ranking prefers title matches, then heading matches, then body matches.
- Settings now include `Canon Mode` with `Prefer Homebrew`, `Prefer Official Sources`, and `Balanced`. This affects reference ranking without automatically turning every imported markdown source into active canon.
- `Prefer Homebrew` is the explicit mode that lets homebrew outrank official material for retrieval. Sourcebooks remain the main rules and lore reference, while adventures remain the main scenario and location reference.
- `/api/reference/index-status` returns the current indexed file count, chunk count, heading count, and last indexed time pulled from the local JSON index files.
- `/api/reference/rebuild` rescans `/data/reference`, rebuilds all reference JSON indexes, and returns the refreshed counts and timestamp.
- In Story Engine, enabling `Use Reference Library` retrieves a few top local chunks before generation and exposes structured follow-up actions: insert into story context, add to lore entry, convert to an adventure hook handoff, link to the current chapter workflow, or save as a local source note.
- This scaffold is designed for local use only and is a clean starting point for future worldbuilding, session recap, and writing tools.
