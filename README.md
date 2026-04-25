# CineSync WatchParty

A simple local watch-party app with a React/Vite client and an Express/Socket.IO server.

The app plays movie files from a folder on your computer. No movie metadata API is required.

## Requirements

- Node.js 18+
- npm
- A local folder containing movie files

Supported file extensions:

```text
.mp4 .mkv .webm .avi .mov
```

Browser playback works best with `.mp4` files using H.264 video and AAC audio.

## Setup

Install dependencies for the root, server, and client:

```bash
npm run install:all
```

Create `server/.env`:

```env
PORT=3001
MOVIES_DIR=D:\kalilinux\Movies
ADMIN_SECRET=change-me
CLIENT_URL=http://localhost:5173
NODE_ENV=development
```

Set `MOVIES_DIR` to the folder where your downloaded movies are stored.

## Start The App

From the project root:

```bash
npm run dev
```

On Windows PowerShell, use:

```powershell
npm.cmd run dev
```

Open:

- App: http://localhost:5173
- Admin: http://localhost:5173/admin

## How To Watch

1. Create a room.
2. Click `Choose Movie File`.
3. Pick a file from your `MOVIES_DIR` list.
4. Share the room link.

## Useful Scripts

```bash
npm run dev          # Start client and server
npm run build        # Build the client
npm start            # Start the server
npm run install:all  # Install all dependencies
```
