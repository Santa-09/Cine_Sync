const express = require('express');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const Busboy = require('busboy');
const roomStore = require('../store/rooms');

const router = express.Router();
const VIDEO_EXTENSIONS = /\.(mp4|mkv|webm|avi|mov)$/i;

function getMoviesDir() {
  return path.resolve(process.env.MOVIES_DIR || path.join(__dirname, '../../../movies'));
}

function getVideoContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.webm') return 'video/webm';
  if (ext === '.mov') return 'video/quicktime';
  return 'video/mp4';
}

function sanitizeVideoFilename(filename) {
  const parsed = path.parse(filename || '');
  const safeBase = parsed.name
    .replace(/[^a-z0-9._ -]/gi, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140);
  const ext = parsed.ext.toLowerCase();

  if (!safeBase || !VIDEO_EXTENSIONS.test(ext)) return null;
  return `${safeBase}${ext}`;
}

function uniqueFilename(dir, filename) {
  const parsed = path.parse(filename);
  let candidate = filename;
  let index = 1;

  while (fs.existsSync(path.join(dir, candidate))) {
    candidate = `${parsed.name}-${index}${parsed.ext}`;
    index += 1;
  }

  return candidate;
}

router.post('/rooms', (req, res) => {
  const { hostName } = req.body;
  if (!hostName) return res.status(400).json({ error: 'hostName required' });

  const roomId = uuidv4().slice(0, 8).toUpperCase();
  const room = roomStore.createRoom({ roomId, hostId: null, hostName });
  res.json({ roomId: room.id });
});

router.get('/health', (req, res) => {
  res.json({
    ok: true,
    moviesDir: getMoviesDir(),
  });
});

router.get('/rooms/:roomId', (req, res) => {
  const room = roomStore.getRoom(req.params.roomId.toUpperCase());
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json(room);
});

router.get('/video/:filename', (req, res) => {
  const moviesDir = getMoviesDir();
  const filePath = path.resolve(moviesDir, req.params.filename);

  if (!filePath.startsWith(moviesDir + path.sep)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Video not found' });
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;
  const contentType = getVideoContentType(req.params.filename);

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;
    const file = fs.createReadStream(filePath, { start, end });

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': contentType,
    });
    file.pipe(res);
    return;
  }

  res.writeHead(200, {
    'Content-Length': fileSize,
    'Content-Type': contentType,
  });
  fs.createReadStream(filePath).pipe(res);
});

router.post('/videos/upload', (req, res) => {
  const moviesDir = getMoviesDir();
  fs.mkdirSync(moviesDir, { recursive: true });

  let savedFilename = null;
  let savedPath = null;
  let uploadError = null;
  let fileSeen = false;

  const busboy = Busboy({
    headers: req.headers,
    limits: {
      files: 1,
      fileSize: 8 * 1024 * 1024 * 1024,
    },
  });

  busboy.on('file', (_fieldName, file, info) => {
    fileSeen = true;
    const filename = sanitizeVideoFilename(info.filename);

    if (!filename) {
      uploadError = 'Only .mp4, .mkv, .webm, .avi, and .mov files are supported.';
      file.resume();
      return;
    }

    savedFilename = uniqueFilename(moviesDir, filename);
    savedPath = path.join(moviesDir, savedFilename);
    const writeStream = fs.createWriteStream(savedPath);

    file.on('limit', () => {
      uploadError = 'Movie file is too large.';
      writeStream.destroy();
    });

    writeStream.on('error', () => {
      uploadError = 'Could not save the uploaded movie.';
    });

    file.pipe(writeStream);
  });

  busboy.on('error', () => {
    uploadError = 'Upload failed.';
  });

  busboy.on('finish', () => {
    if (!fileSeen) {
      return res.status(400).json({ error: 'No movie file uploaded.' });
    }

    if (uploadError) {
      if (savedPath && fs.existsSync(savedPath)) fs.rmSync(savedPath, { force: true });
      return res.status(400).json({ error: uploadError });
    }

    res.json({
      filename: savedFilename,
      videoUrl: `/api/video/${encodeURIComponent(savedFilename)}`,
    });
  });

  req.pipe(busboy);
});

router.get('/videos', (req, res) => {
  const moviesDir = getMoviesDir();
  if (!fs.existsSync(moviesDir)) return res.json([]);

  const files = fs
    .readdirSync(moviesDir)
    .filter((file) => VIDEO_EXTENSIONS.test(file))
    .sort((a, b) => a.localeCompare(b));

  res.json(files);
});

router.use('/admin', (req, res, next) => {
  const secret = req.headers['x-admin-secret'];
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

router.get('/admin/stats', (req, res) => {
  res.json(roomStore.getRoomStats());
});

router.delete('/admin/rooms/:roomId', (req, res) => {
  const roomId = req.params.roomId.toUpperCase();
  const io = req.app.get('io');
  io?.to(roomId).emit('room:force-closed', { reason: 'Closed by admin' });

  const deleted = roomStore.deleteRoom(roomId);
  if (!deleted) return res.status(404).json({ error: 'Room not found' });
  res.json({ success: true });
});

router.delete('/admin/rooms', (req, res) => {
  const all = roomStore.getAllRooms();
  const io = req.app.get('io');

  all.forEach((room) => {
    io?.to(room.id).emit('room:force-closed', { reason: 'Closed by admin' });
    roomStore.deleteRoom(room.id);
  });

  res.json({ deleted: all.length });
});

module.exports = router;
