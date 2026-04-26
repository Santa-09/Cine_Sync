require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const apiRouter = require('./routes/api');
const registerSocketHandlers = require('./socket/handlers');

const app = express();
const server = http.createServer(app);
const isProduction = process.env.NODE_ENV === 'production';

const allowedOrigins = [
  process.env.CLIENT_URL || 'http://localhost:5173',
  'http://localhost:3000',
  /\.railway\.app$/,
  /\.up\.railway\.app$/,
  /\.onrender\.com$/,
];

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

function shutdown(signal) {
  console.log(`${signal} received, closing server...`);
  io.close(() => {
    server.close(() => {
      process.exit(0);
    });
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

app.set('io', io);
app.set('trust proxy', 1);

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());

// API routes
app.use('/api', apiRouter);

// Serve React build in production
if (isProduction) {
  const clientDist = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Register socket handlers
registerSocketHandlers(io);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`\n🎬  WatchParty server running on port ${PORT}`);
  console.log(`📡  Socket.IO ready`);
  console.log(`🎥  Movies dir: ${process.env.MOVIES_DIR || 'not set'}\n`);
});
