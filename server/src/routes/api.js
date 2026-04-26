const express = require('express');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const Busboy = require('busboy');
const roomStore = require('../store/rooms');

const router = express.Router();
const VIDEO_EXTENSIONS = /\.(mp4|mkv|webm|avi|mov)$/i;
const MAX_VIDEO_SIZE = 8 * 1024 * 1024 * 1024;
const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024;

function getMoviesDir() {
  return path.resolve(process.env.MOVIES_DIR || path.join(__dirname, '../../../movies'));
}

function getUploadsDir() {
  return path.join(getMoviesDir(), '.uploads');
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

function getSessionPath(uploadId) {
  return path.join(getUploadsDir(), `${uploadId}.json`);
}

function getResumeIndexPath(resumeKey) {
  return path.join(getUploadsDir(), `resume-${resumeKey}.txt`);
}

function getChunkPath(uploadId, chunkIndex) {
  return path.join(getUploadsDir(), `${uploadId}.part.${chunkIndex}`);
}

function sanitizeResumeKey(value) {
  if (typeof value !== 'string') return null;
  const key = value.replace(/[^a-z0-9_-]/gi, '').trim().slice(0, 120);
  return key || null;
}

async function ensureUploadsDir() {
  await fsp.mkdir(getUploadsDir(), { recursive: true });
}

async function readJsonIfExists(filePath) {
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeSession(session) {
  await ensureUploadsDir();
  await fsp.writeFile(getSessionPath(session.uploadId), JSON.stringify(session, null, 2));
}

async function loadSession(uploadId) {
  return readJsonIfExists(getSessionPath(uploadId));
}

async function removeFileIfExists(filePath) {
  try {
    await fsp.rm(filePath, { force: true });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

async function removeUploadArtifacts(session) {
  const totalChunks = Number.isFinite(session.totalChunks) ? session.totalChunks : 0;
  const removals = [removeFileIfExists(getSessionPath(session.uploadId))];

  if (session.resumeKey) {
    removals.push(removeFileIfExists(getResumeIndexPath(session.resumeKey)));
  }

  for (let index = 0; index < totalChunks; index += 1) {
    removals.push(removeFileIfExists(getChunkPath(session.uploadId, index)));
  }

  await Promise.all(removals);
}

async function collectUploadedChunks(uploadId, totalChunks) {
  const uploadedChunks = [];
  for (let index = 0; index < totalChunks; index += 1) {
    try {
      const stat = await fsp.stat(getChunkPath(uploadId, index));
      if (stat.size > 0) uploadedChunks.push(index);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return uploadedChunks;
}

function validateUploadRequest(filename, fileSize) {
  const safeFilename = sanitizeVideoFilename(filename);
  const size = Number(fileSize);

  if (!safeFilename) return { error: 'Only .mp4, .mkv, .webm, .avi, and .mov files are supported.' };
  if (!Number.isFinite(size) || size <= 0) return { error: 'A valid file size is required.' };
  if (size > MAX_VIDEO_SIZE) return { error: 'Movie file is too large.' };

  return { safeFilename, fileSize: size };
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
      fileSize: MAX_VIDEO_SIZE,
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

router.post('/videos/upload-session', async (req, res) => {
  try {
    const { filename, fileSize, resumeKey } = req.body || {};
    const validated = validateUploadRequest(filename, fileSize);
    if (validated.error) return res.status(400).json({ error: validated.error });

    const { safeFilename, fileSize: safeFileSize } = validated;
    const normalizedResumeKey = sanitizeResumeKey(resumeKey);
    const moviesDir = getMoviesDir();
    await fsp.mkdir(moviesDir, { recursive: true });
    await ensureUploadsDir();

    if (normalizedResumeKey) {
      const resumeIndexPath = getResumeIndexPath(normalizedResumeKey);
      try {
        const existingUploadId = (await fsp.readFile(resumeIndexPath, 'utf8')).trim();
        if (existingUploadId) {
          const existingSession = await loadSession(existingUploadId);
          if (
            existingSession &&
            existingSession.filename === safeFilename &&
            existingSession.fileSize === safeFileSize
          ) {
            const targetPath = path.join(moviesDir, existingSession.finalFilename);
            if (fs.existsSync(targetPath)) {
              await removeUploadArtifacts(existingSession);
            } else {
              const uploadedChunks = await collectUploadedChunks(existingSession.uploadId, existingSession.totalChunks);
              existingSession.updatedAt = new Date().toISOString();
              await writeSession(existingSession);
              return res.json({
                uploadId: existingSession.uploadId,
                filename: existingSession.finalFilename,
                chunkSize: existingSession.chunkSize,
                totalChunks: existingSession.totalChunks,
                uploadedChunks,
                resumed: true,
              });
            }
          } else {
            await removeFileIfExists(resumeIndexPath);
          }
        }
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }

    const finalFilename = uniqueFilename(moviesDir, safeFilename);
    const uploadId = uuidv4();
    const totalChunks = Math.max(1, Math.ceil(safeFileSize / DEFAULT_CHUNK_SIZE));
    const session = {
      uploadId,
      filename: safeFilename,
      finalFilename,
      fileSize: safeFileSize,
      chunkSize: DEFAULT_CHUNK_SIZE,
      totalChunks,
      resumeKey: normalizedResumeKey,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await writeSession(session);
    if (normalizedResumeKey) {
      await fsp.writeFile(getResumeIndexPath(normalizedResumeKey), uploadId);
    }

    return res.json({
      uploadId,
      filename: finalFilename,
      chunkSize: DEFAULT_CHUNK_SIZE,
      totalChunks,
      uploadedChunks: [],
      resumed: false,
    });
  } catch (error) {
    console.error('Failed to create upload session:', error);
    return res.status(500).json({ error: 'Could not start upload session.' });
  }
});

router.put('/videos/upload-session/:uploadId/chunks/:chunkIndex', async (req, res) => {
  try {
    const { uploadId } = req.params;
    const chunkIndex = Number(req.params.chunkIndex);
    const session = await loadSession(uploadId);

    if (!session) return res.status(404).json({ error: 'Upload session not found.' });
    if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= session.totalChunks) {
      return res.status(400).json({ error: 'Invalid chunk index.' });
    }

    const expectedChunkSize = chunkIndex === session.totalChunks - 1
      ? session.fileSize - (session.chunkSize * chunkIndex)
      : session.chunkSize;

    const contentLength = Number(req.headers['content-length']);
    if (!Number.isFinite(contentLength) || contentLength <= 0) {
      return res.status(411).json({ error: 'Content-Length required.' });
    }
    if (contentLength !== expectedChunkSize) {
      return res.status(400).json({ error: 'Chunk size mismatch.' });
    }

    await ensureUploadsDir();
    const chunkPath = getChunkPath(uploadId, chunkIndex);
    const writeStream = fs.createWriteStream(chunkPath);

    await new Promise((resolve, reject) => {
      req.pipe(writeStream);
      req.on('error', reject);
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    session.updatedAt = new Date().toISOString();
    await writeSession(session);

    return res.json({ success: true, chunkIndex });
  } catch (error) {
    console.error('Failed to upload chunk:', error);
    return res.status(500).json({ error: 'Could not upload chunk.' });
  }
});

router.post('/videos/upload-session/:uploadId/complete', async (req, res) => {
  try {
    const { uploadId } = req.params;
    const session = await loadSession(uploadId);
    if (!session) return res.status(404).json({ error: 'Upload session not found.' });

    const uploadedChunks = await collectUploadedChunks(uploadId, session.totalChunks);
    if (uploadedChunks.length !== session.totalChunks) {
      return res.status(400).json({ error: 'Upload is incomplete.', uploadedChunks });
    }

    const moviesDir = getMoviesDir();
    await fsp.mkdir(moviesDir, { recursive: true });
    const finalPath = path.join(moviesDir, session.finalFilename);

    await new Promise((resolve, reject) => {
      const destination = fs.createWriteStream(finalPath);
      let current = 0;

      const appendNextChunk = () => {
        if (current >= session.totalChunks) {
          destination.end();
          return;
        }

        const source = fs.createReadStream(getChunkPath(uploadId, current));
        source.on('error', reject);
        source.on('end', () => {
          current += 1;
          appendNextChunk();
        });
        source.pipe(destination, { end: false });
      };

      destination.on('finish', resolve);
      destination.on('error', reject);
      appendNextChunk();
    });

    await removeUploadArtifacts(session);

    return res.json({
      filename: session.finalFilename,
      videoUrl: `/api/video/${encodeURIComponent(session.finalFilename)}`,
    });
  } catch (error) {
    console.error('Failed to finalize upload:', error);
    return res.status(500).json({ error: 'Could not finalize upload.' });
  }
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
