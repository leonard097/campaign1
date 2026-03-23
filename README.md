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

## Notes

- No authentication is included.
- Data lives in [`/data/chronicle.json`](./data/chronicle.json).
- The backend auto-creates `/data/reference/sourcebooks`, `/data/reference/adventures`, `/data/reference/homebrew`, and `/data/reference/indexes`.
- Place your own `.md` files anywhere inside those folders. The backend scans them recursively, parses each markdown source into a structured record, and keeps JSON indexes at `/data/reference/indexes/reference-index.json`, `/data/reference/indexes/headings-index.json`, and `/data/reference/indexes/reference-chunks.json`.
- Parsed reference records include stable IDs, titles, inferred source metadata, headings, tags, summaries, raw markdown, filename, and modified date for local search and lookup.
- The ingestion pipeline also splits files into smaller heading-aware chunks with preserved heading paths, token estimates, and per-chunk tags for future chunk-level search.
- This scaffold is designed for local use only and is a clean starting point for future worldbuilding, session recap, and writing tools.
