# Mythic Chronicle

`mythic-chronicle` is a local-only full-stack starter for a personal D&D storytelling and novel writing assistant.

## Project Structure

```text
mythic-chronicle/
  frontend/  React + Vite client
  backend/   Express API server
  data/      Local JSON files for campaign and writing data
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

## Notes

- No authentication is included.
- Data lives in [`/data/chronicle.json`](./data/chronicle.json).
- This scaffold is designed for local use only and is a clean starting point for future worldbuilding, session recap, and writing tools.
