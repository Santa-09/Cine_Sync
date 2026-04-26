# CineSync WatchParty

A local-file watch party app with React, Vite, Express, and Socket.IO.

## Features

- Host-controlled synced playback
- Chat and room members
- Movie list from the server `movies/` folder
- Upload a movie from the host computer into `movies/`
- Direct video URL playback when the URL is browser-playable
- Render-ready build/start configuration

## Local Setup

Install dependencies:

```bash
npm install
```

Create `server/.env`:

```env
PORT=3001
MOVIES_DIR=../movies
ADMIN_SECRET=change-me
CLIENT_URL=http://localhost:5173
NODE_ENV=development
```

Start locally:

```bash
npm run dev
```

On Windows PowerShell:

```powershell
npm.cmd run dev
```

Open:

- App: http://localhost:5173
- Admin: http://localhost:5173/admin

## Movies Folder

The repo keeps an empty `movies/` folder using `movies/.gitkeep`.

Movie files are ignored by Git:

```text
movies/*
!movies/.gitkeep
```

This prevents large video files from breaking GitHub pushes. Put movies there locally, upload through the app, or use a persistent disk in production.

Supported extensions:

```text
.mp4 .mkv .webm .avi .mov
```

Browser playback works best with `.mp4` using H.264 video and AAC audio.

## Render Deploy

This repo now includes [render.yaml](/c:/Users/santa/OneDrive/Desktop/watchparty1/render.yaml).

Render uses:

```text
Build command: npm install && npm run build
Start command: npm start
Healthcheck: /api/health
```

Set these Render environment values:

```env
NODE_ENV=production
CLIENT_URL=https://your-app.onrender.com
MOVIES_DIR=/var/data/movies
```

Set this secret in Render:

```env
ADMIN_SECRET=your-secure-password
```

For persistent movie storage:

1. Create the web service from this repo.
2. Attach the disk defined in `render.yaml`.
3. Keep `MOVIES_DIR=/var/data/movies`.

Without a disk, uploaded movies can disappear after redeploy or restart.

Important:

- This app keeps room state in memory, so run a single instance.
- If you add a custom domain later, update `CLIENT_URL` to that HTTPS URL too.

## Push Checklist

Before pushing:

```bash
npm run build
```

Commit source/config files, but do not commit:

- `server/.env`
- `node_modules/`
- `client/dist/`
- real movie files in `movies/`
