const { v4: uuidv4 } = require('uuid');
const roomStore = require('../store/rooms');

function normalizeRoomId(roomId) {
  return typeof roomId === 'string' ? roomId.trim().toUpperCase() : '';
}

module.exports = function registerSocketHandlers(io) {
  // Drift correction: broadcast projected room playback time to viewers.
  setInterval(() => {
    for (const room of roomStore.getAllRooms()) {
      if (room.isPlaying) {
        const snapshot = roomStore.getRoomSnapshot(room.id);
        io.to(room.id).emit('sync:drift', {
          currentTime: snapshot.currentTime,
          isPlaying: snapshot.isPlaying,
          serverTime: Date.now(),
        });
      }
    }
  }, 2000);

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // ── Join room ─────────────────────────────────────────
    socket.on('room:join', ({ roomId, username }, callback) => {
      const id = normalizeRoomId(roomId);
      if (!id || !username?.trim()) {
        callback?.({ success: false, error: 'roomId and username required' });
        return;
      }
      let room = roomStore.getRoom(id);

      if (!room) {
        // Auto-create room if it doesn't exist yet (host joins first via socket)
        room = roomStore.createRoom({ roomId: id, hostId: socket.id, hostName: username.trim() });
      }

      const isHost = room.members.length === 0 || room.hostId === socket.id;
      if (room.members.length === 0) {
        room.hostId = socket.id;
      }

      const member = { socketId: socket.id, username: username.trim(), isHost, joinedAt: new Date().toISOString() };
      roomStore.addMember(id, member);
      socket.join(id);
      socket.data.roomId = id;
      socket.data.username = username;

      // Send current room state to the joining user
      if (callback) {
        callback({
          success: true,
          room: roomStore.getRoomSnapshot(id),
          isHost,
          member,
        });
      }

      // Notify others
      socket.to(id).emit('room:user-joined', { member, memberCount: roomStore.getRoom(id).members.length });
    });

    // ── Video sync ────────────────────────────────────────
    socket.on('sync:play', ({ roomId, currentTime }) => {
      roomId = normalizeRoomId(roomId);
      const room = roomStore.getRoom(roomId);
      if (!room || room.hostId !== socket.id) return;
      roomStore.updatePlayState(roomId, true, currentTime);
      socket.to(roomId).emit('sync:play', { currentTime, serverTime: Date.now() });
    });

    socket.on('sync:pause', ({ roomId, currentTime }) => {
      roomId = normalizeRoomId(roomId);
      const room = roomStore.getRoom(roomId);
      if (!room || room.hostId !== socket.id) return;
      roomStore.updatePlayState(roomId, false, currentTime);
      socket.to(roomId).emit('sync:pause', { currentTime, serverTime: Date.now() });
    });

    socket.on('sync:seek', ({ roomId, currentTime }) => {
      roomId = normalizeRoomId(roomId);
      const room = roomStore.getRoom(roomId);
      if (!room || room.hostId !== socket.id) return;
      roomStore.updatePlayState(roomId, room.isPlaying, currentTime);
      socket.to(roomId).emit('sync:seek', {
        currentTime,
        isPlaying: room.isPlaying,
        serverTime: Date.now(),
      });
    });

    socket.on('sync:heartbeat', ({ roomId, currentTime }) => {
      roomId = normalizeRoomId(roomId);
      const room = roomStore.getRoom(roomId);
      if (!room || room.hostId !== socket.id) return;
      roomStore.updatePlayState(roomId, room.isPlaying, currentTime);
      socket.to(roomId).emit('sync:drift', {
        currentTime,
        isPlaying: room.isPlaying,
        serverTime: Date.now(),
      });
    });

    // ── Movie change ──────────────────────────────────────
    socket.on('room:movie-change', ({ roomId, movie }) => {
      roomId = normalizeRoomId(roomId);
      const room = roomStore.getRoom(roomId);
      if (!room || room.hostId !== socket.id) return;
      roomStore.updateMovie(roomId, movie);
      io.to(roomId).emit('room:movie-change', { movie });
    });

    socket.on('room:video-url', ({ roomId, videoUrl, filename }) => {
      roomId = normalizeRoomId(roomId);
      const room = roomStore.getRoom(roomId);
      if (!room || room.hostId !== socket.id) return;
      roomStore.updateVideoUrl(roomId, videoUrl, filename || null);
      io.to(roomId).emit('room:video-url', { videoUrl, filename });
    });

    // ── Chat ──────────────────────────────────────────────
    socket.on('chat:message', ({ roomId, text }) => {
      roomId = normalizeRoomId(roomId);
      const room = roomStore.getRoom(roomId);
      if (!room || !text?.trim()) return;
      const message = {
        id: uuidv4(),
        socketId: socket.id,
        username: socket.data.username,
        text: text.trim(),
        timestamp: new Date().toISOString(),
      };
      roomStore.addChat(roomId, message);
      io.to(roomId).emit('chat:message', message);
    });

    socket.on('room:leave', ({ roomId }) => {
      roomId = normalizeRoomId(roomId) || socket.data.roomId;
      if (!roomId) return;

      const room = roomStore.removeMember(roomId, socket.id);
      socket.leave(roomId);
      socket.data.roomId = null;

      if (!room) return;
      if (room.hostId === socket.id && room.members.length > 0) {
        room.hostId = room.members[0].socketId;
        room.members[0].isHost = true;
        io.to(roomId).emit('room:host-changed', {
          newHostId: room.hostId,
          newHostName: room.members[0].username,
          members: room.members,
        });
      }
      io.to(roomId).emit('room:user-left', {
        socketId: socket.id,
        memberCount: room.members.length,
      });
    });

    // ── Disconnect ────────────────────────────────────────
    socket.on('disconnect', () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const room = roomStore.removeMember(roomId, socket.id);
      if (room) {
        // If host left, assign new host
        if (room.hostId === socket.id && room.members.length > 0) {
          room.hostId = room.members[0].socketId;
          room.members[0].isHost = true;
          io.to(roomId).emit('room:host-changed', {
            newHostId: room.hostId,
            newHostName: room.members[0].username,
            members: room.members,
          });
        }
        io.to(roomId).emit('room:user-left', {
          socketId: socket.id,
          memberCount: room.members.length,
        });
      }
    });

    // ── Admin force-close room ────────────────────────────
    socket.on('admin:close-room', ({ roomId, secret }) => {
      if (secret !== process.env.ADMIN_SECRET) return;
      roomId = normalizeRoomId(roomId);
      io.to(roomId).emit('room:force-closed', { reason: 'Closed by admin' });
      roomStore.deleteRoom(roomId);
    });
  });
};
