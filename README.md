# CineSync WatchParty

A local-file watch party app with React, Vite, Express, and Socket.IO.

## Features

- Host-controlled synced playback
- Chat and room members
- Movie list from the server `movies/` folder
- Upload a movie from the host computer into `movies/`
- Direct video URL playback when the URL is browser-playable
- Railway-ready build/start configuration

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

This prevents large video files from breaking GitHub pushes. Put movies there locally, upload through the app, or use a Railway Volume in production.

Supported extensions:

```text
.mp4 .mkv .webm .avi .mov
```

Browser playback works best with `.mp4` using H.264 video and AAC audio.

## Railway Deploy

This repo includes `railway.toml`.

Railway uses:

```text
Build command: npm run build
Start command: npm start
Healthcheck: /api/health
```

Set these Railway variables:

```env
NODE_ENV=production
ADMIN_SECRET=your-secure-password
CLIENT_URL=https://your-app.up.railway.app
MOVIES_DIR=/app/movies
```

For persistent movie storage:

1. Create a Railway Volume.
2. Attach it to the app service.
3. Mount it at `/app/movies`.
4. Keep `MOVIES_DIR=/app/movies`.

Without a volume, uploaded movies can disappear after redeploy.

## Fly.io Deploy

This repo now includes [fly.toml](/c:/Users/santa/OneDrive/Desktop/watchparty1/fly.toml) and a production [Dockerfile](/c:/Users/santa/OneDrive/Desktop/watchparty1/Dockerfile).

The Fly setup is tuned for this app:

- React is built during the image build.
- Express serves the built client and Socket.IO.
- Health check uses `/api/health`.
- Uploaded movies are stored in a Fly volume mounted at `/data`.
- The app is kept to a single running machine because rooms and playback state live in memory.

Create the Fly app and volume:

```bash
fly launch --no-deploy
fly volumes create cine_sync_data --region sin --size 10
```

Set secrets:

```bash
fly secrets set ADMIN_SECRET=change-me CLIENT_URL=https://cine-sync.fly.dev
```

Deploy:

```bash
fly deploy
```

Fly dashboard values if you deploy from GitHub:

```text
App name: cine-sync
Region: sin
Internal port: 8080
Working directory: ./
Config path: ./fly.toml
```

Environment variables:

```env
NODE_ENV=production
PORT=8080
MOVIES_DIR=/data/movies
CLIENT_URL=https://cine-sync.fly.dev
```

Secrets:

```env
ADMIN_SECRET=your-secure-password
```

Important:

- Do not enable multiple machines for this version of the app.
- Do not attach Fly Postgres unless you plan to rewrite room storage; the current app does not use a database.
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
